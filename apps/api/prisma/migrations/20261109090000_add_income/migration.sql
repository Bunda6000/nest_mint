-- CreateEnum
CREATE TYPE "income_recurrence" AS ENUM ('monthly', 'one_off');

-- CreateTable
CREATE TABLE "incomes" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "amount_mkd" INTEGER NOT NULL,
    "recurrence" "income_recurrence" NOT NULL,
    "received_on" DATE,
    "start_month" DATE,
    "end_month" DATE,
    "pay_day" SMALLINT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "incomes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "incomes_user_id_idx" ON "incomes"("user_id");

-- AddForeignKey
ALTER TABLE "incomes" ADD CONSTRAINT "incomes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Rules the application also checks; the database refuses bad data even if a bug slips through.
ALTER TABLE "incomes" ADD CONSTRAINT "incomes_amount_mkd_check" CHECK ("amount_mkd" >= 1 AND "amount_mkd" <= 100000000);
ALTER TABLE "incomes" ADD CONSTRAINT "incomes_name_length_check" CHECK (char_length(btrim("name")) BETWEEN 1 AND 60);
ALTER TABLE "incomes" ADD CONSTRAINT "incomes_pay_day_check" CHECK ("pay_day" IS NULL OR "pay_day" BETWEEN 1 AND 31);
-- Months are stored as the first day of the month.
ALTER TABLE "incomes" ADD CONSTRAINT "incomes_month_start_check" CHECK (
  ("start_month" IS NULL OR EXTRACT(DAY FROM "start_month") = 1)
  AND ("end_month" IS NULL OR EXTRACT(DAY FROM "end_month") = 1)
);
ALTER TABLE "incomes" ADD CONSTRAINT "incomes_end_after_start_check" CHECK ("end_month" IS NULL OR "end_month" >= "start_month");
-- Monthly income has a start month and a pay day; one-off income has only its date.
ALTER TABLE "incomes" ADD CONSTRAINT "incomes_recurrence_fields_check" CHECK (
  ("recurrence" = 'monthly' AND "start_month" IS NOT NULL AND "pay_day" IS NOT NULL AND "received_on" IS NULL)
  OR ("recurrence" = 'one_off' AND "received_on" IS NOT NULL AND "start_month" IS NULL AND "end_month" IS NULL AND "pay_day" IS NULL)
);

-- Block Supabase's public data API (see 20261107230000_enable_rls).
ALTER TABLE "incomes" ENABLE ROW LEVEL SECURITY;
