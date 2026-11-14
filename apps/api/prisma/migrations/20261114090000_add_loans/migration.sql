-- CreateEnum
CREATE TYPE "obligation_kind" AS ENUM ('bill', 'loan');

-- CreateEnum
CREATE TYPE "loan_type" AS ENUM ('housing', 'consumer', 'other');

-- AlterTable
ALTER TABLE "obligations" ADD COLUMN "kind" "obligation_kind" NOT NULL DEFAULT 'bill',
ADD COLUMN "loan_type" "loan_type",
ADD COLUMN "principal_mkd" INTEGER,
ADD COLUMN "annual_rate_bp" INTEGER;

-- A bill has no loan fields. A loan has all of them, a lender (the payee), a last month, and is
-- paid every month. The rate is in basis points (450 = 4.50 %), at most 100.00 %.
ALTER TABLE "obligations" ADD CONSTRAINT "obligations_kind_fields_check" CHECK (
  ("kind" = 'bill' AND "loan_type" IS NULL AND "principal_mkd" IS NULL AND "annual_rate_bp" IS NULL)
  OR ("kind" = 'loan'
      AND "loan_type" IS NOT NULL
      AND "principal_mkd" BETWEEN 1 AND 1000000000
      AND "annual_rate_bp" BETWEEN 0 AND 10000
      AND "payee" IS NOT NULL
      AND "end_month" IS NOT NULL
      AND "recurrence" = 'monthly')
);
