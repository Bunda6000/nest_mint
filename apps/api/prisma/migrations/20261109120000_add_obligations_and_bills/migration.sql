-- CreateEnum
CREATE TYPE "obligation_recurrence" AS ENUM ('monthly', 'every_n_months', 'custom_months');

-- CreateTable
CREATE TABLE "obligations" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "payee" TEXT,
    "expected_amount_mkd" INTEGER NOT NULL,
    "due_day" SMALLINT NOT NULL,
    "recurrence" "obligation_recurrence" NOT NULL,
    "every_n_months" SMALLINT,
    "months" SMALLINT[] DEFAULT ARRAY[]::SMALLINT[],
    "start_month" DATE NOT NULL,
    "end_month" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "obligations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bills" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "obligation_id" UUID NOT NULL,
    "period_month" DATE NOT NULL,
    "due_date" DATE NOT NULL,
    "expected_amount_mkd" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bills_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "obligations_user_id_idx" ON "obligations"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "obligations_id_user_id_key" ON "obligations"("id", "user_id");

-- CreateIndex
CREATE INDEX "bills_user_id_period_month_idx" ON "bills"("user_id", "period_month");

-- CreateIndex
CREATE UNIQUE INDEX "bills_obligation_id_period_month_key" ON "bills"("obligation_id", "period_month");

-- AddForeignKey
ALTER TABLE "obligations" ADD CONSTRAINT "obligations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "obligations" ADD CONSTRAINT "obligations_category_id_user_id_fkey" FOREIGN KEY ("category_id", "user_id") REFERENCES "categories"("id", "user_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bills" ADD CONSTRAINT "bills_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bills" ADD CONSTRAINT "bills_obligation_id_user_id_fkey" FOREIGN KEY ("obligation_id", "user_id") REFERENCES "obligations"("id", "user_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- Rules the application also checks; the database refuses bad data even if a bug slips through.
ALTER TABLE "obligations" ADD CONSTRAINT "obligations_expected_amount_check" CHECK ("expected_amount_mkd" >= 1 AND "expected_amount_mkd" <= 100000000);
ALTER TABLE "obligations" ADD CONSTRAINT "obligations_name_length_check" CHECK (char_length(btrim("name")) BETWEEN 1 AND 60);
ALTER TABLE "obligations" ADD CONSTRAINT "obligations_payee_length_check" CHECK ("payee" IS NULL OR char_length(btrim("payee")) BETWEEN 1 AND 60);
ALTER TABLE "obligations" ADD CONSTRAINT "obligations_due_day_check" CHECK ("due_day" BETWEEN 1 AND 31);
-- Months are stored as the first day of the month.
ALTER TABLE "obligations" ADD CONSTRAINT "obligations_month_start_check" CHECK (
  EXTRACT(DAY FROM "start_month") = 1
  AND ("end_month" IS NULL OR EXTRACT(DAY FROM "end_month") = 1)
);
ALTER TABLE "obligations" ADD CONSTRAINT "obligations_end_after_start_check" CHECK ("end_month" IS NULL OR "end_month" >= "start_month");
-- Prisma makes list columns nullable; a NULL list would slip past the checks below, so refuse it.
ALTER TABLE "obligations" ADD CONSTRAINT "obligations_months_not_null_check" CHECK ("months" IS NOT NULL);
-- Each recurrence has its own fields: n for "every n months", the list of calendar months for "custom".
ALTER TABLE "obligations" ADD CONSTRAINT "obligations_recurrence_fields_check" CHECK (
  ("recurrence" = 'monthly' AND "every_n_months" IS NULL AND cardinality("months") = 0)
  OR ("recurrence" = 'every_n_months' AND "every_n_months" BETWEEN 2 AND 12 AND cardinality("months") = 0)
  OR ("recurrence" = 'custom_months' AND "every_n_months" IS NULL AND cardinality("months") BETWEEN 1 AND 12
      AND "months" <@ ARRAY[1,2,3,4,5,6,7,8,9,10,11,12]::SMALLINT[])
);

ALTER TABLE "bills" ADD CONSTRAINT "bills_expected_amount_check" CHECK ("expected_amount_mkd" >= 1 AND "expected_amount_mkd" <= 100000000);
-- The period is the first day of a month and the due date falls inside that month.
ALTER TABLE "bills" ADD CONSTRAINT "bills_period_month_check" CHECK (EXTRACT(DAY FROM "period_month") = 1);
ALTER TABLE "bills" ADD CONSTRAINT "bills_due_in_period_check" CHECK (date_trunc('month', "due_date")::date = "period_month");

-- Block Supabase's public data API (see 20261107230000_enable_rls).
ALTER TABLE "obligations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "bills" ENABLE ROW LEVEL SECURITY;
