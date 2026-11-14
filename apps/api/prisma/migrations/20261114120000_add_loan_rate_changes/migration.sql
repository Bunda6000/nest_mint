-- CreateTable
CREATE TABLE "loan_rate_changes" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "obligation_id" UUID NOT NULL,
    "effective_month" DATE NOT NULL,
    "annual_rate_bp" INTEGER NOT NULL,
    "monthly_payment_mkd" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loan_rate_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "loan_rate_changes_user_id_idx" ON "loan_rate_changes"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "loan_rate_changes_obligation_id_effective_month_key" ON "loan_rate_changes"("obligation_id", "effective_month");

-- AddForeignKey
ALTER TABLE "loan_rate_changes" ADD CONSTRAINT "loan_rate_changes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: a change can only point at a loan of the same user (ADR-006).
ALTER TABLE "loan_rate_changes" ADD CONSTRAINT "loan_rate_changes_obligation_id_user_id_fkey" FOREIGN KEY ("obligation_id", "user_id") REFERENCES "obligations"("id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Rules the application also checks; the database refuses bad data even if a bug slips through.
ALTER TABLE "loan_rate_changes" ADD CONSTRAINT "loan_rate_changes_month_start_check" CHECK (EXTRACT(DAY FROM "effective_month") = 1);
ALTER TABLE "loan_rate_changes" ADD CONSTRAINT "loan_rate_changes_rate_check" CHECK ("annual_rate_bp" BETWEEN 0 AND 10000);
ALTER TABLE "loan_rate_changes" ADD CONSTRAINT "loan_rate_changes_payment_check" CHECK ("monthly_payment_mkd" BETWEEN 1 AND 100000000);

-- Row level security, like every table (see docs/adr/006-user-data-isolation.md).
ALTER TABLE "loan_rate_changes" ENABLE ROW LEVEL SECURITY;
