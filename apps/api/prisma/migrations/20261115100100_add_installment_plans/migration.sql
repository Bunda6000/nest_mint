-- An installment plan: contract total and first installment; the regular installment is the
-- obligation's expected amount and the last month is worked out when it is created.
ALTER TABLE "obligations" ADD COLUMN "contract_total_mkd" INTEGER;
ALTER TABLE "obligations" ADD COLUMN "first_installment_mkd" INTEGER;

ALTER TABLE "obligations" DROP CONSTRAINT "obligations_kind_fields_check";

-- A bill has no loan or installment fields. A loan has all of the loan fields, a lender (the payee),
-- a last month, and is paid every month. An installment plan has both of its amounts (the first
-- one at most the total), a last month, and is paid every month; the seller is optional.
ALTER TABLE "obligations" ADD CONSTRAINT "obligations_kind_fields_check" CHECK (
  ("kind" = 'bill'
      AND "loan_type" IS NULL AND "principal_mkd" IS NULL AND "annual_rate_bp" IS NULL
      AND "contract_total_mkd" IS NULL AND "first_installment_mkd" IS NULL)
  OR ("kind" = 'loan'
      AND "loan_type" IS NOT NULL
      AND "principal_mkd" BETWEEN 1 AND 1000000000
      AND "annual_rate_bp" BETWEEN 0 AND 10000
      AND "payee" IS NOT NULL
      AND "end_month" IS NOT NULL
      AND "recurrence" = 'monthly'
      AND "contract_total_mkd" IS NULL AND "first_installment_mkd" IS NULL)
  OR ("kind" = 'installment'
      AND "loan_type" IS NULL AND "principal_mkd" IS NULL AND "annual_rate_bp" IS NULL
      AND "contract_total_mkd" BETWEEN 1 AND 1000000000
      AND "first_installment_mkd" BETWEEN 1 AND "contract_total_mkd"
      AND "end_month" IS NOT NULL
      AND "recurrence" = 'monthly')
);
