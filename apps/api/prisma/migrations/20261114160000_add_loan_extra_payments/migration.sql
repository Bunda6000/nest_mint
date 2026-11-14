-- CreateEnum
CREATE TYPE "extra_payment_kind" AS ENUM ('extra', 'payoff');

-- CreateTable
CREATE TABLE "loan_extra_payments" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "obligation_id" UUID NOT NULL,
    "paid_on" DATE NOT NULL,
    "amount_mkd" INTEGER NOT NULL,
    "kind" "extra_payment_kind" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loan_extra_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "loan_extra_payments_obligation_id_idx" ON "loan_extra_payments"("obligation_id");

-- CreateIndex
CREATE INDEX "loan_extra_payments_user_id_idx" ON "loan_extra_payments"("user_id");

-- AddForeignKey
ALTER TABLE "loan_extra_payments" ADD CONSTRAINT "loan_extra_payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: a payment can only point at a loan of the same user (ADR-006).
ALTER TABLE "loan_extra_payments" ADD CONSTRAINT "loan_extra_payments_obligation_id_user_id_fkey" FOREIGN KEY ("obligation_id", "user_id") REFERENCES "obligations"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Rules the application also checks; the database refuses bad data even if a bug slips through.
ALTER TABLE "loan_extra_payments" ADD CONSTRAINT "loan_extra_payments_amount_check" CHECK ("amount_mkd" BETWEEN 1 AND 1000000000);

-- Every table is private to its owner (ADR-006).
ALTER TABLE "loan_extra_payments" ENABLE ROW LEVEL SECURITY;
