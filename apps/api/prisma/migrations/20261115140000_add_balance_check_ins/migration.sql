-- A monthly check of the books against the real balance of the main salary account (NM-31).
CREATE TABLE "balance_check_ins" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "month" DATE NOT NULL,
    "closing_balance_mkd" INTEGER NOT NULL,
    "opening_balance_mkd" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "balance_check_ins_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "balance_check_ins_user_id_idx" ON "balance_check_ins"("user_id");
-- One check-in per user and month; a second one replaces the first.
CREATE UNIQUE INDEX "balance_check_ins_user_id_month_key" ON "balance_check_ins"("user_id", "month");

ALTER TABLE "balance_check_ins" ADD CONSTRAINT "balance_check_ins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Rules the application also checks; the database refuses bad data even if a bug slips through.
ALTER TABLE "balance_check_ins" ADD CONSTRAINT "balance_check_ins_month_start_check" CHECK (EXTRACT(DAY FROM "month") = 1);
ALTER TABLE "balance_check_ins" ADD CONSTRAINT "balance_check_ins_closing_check" CHECK ("closing_balance_mkd" BETWEEN -1000000000 AND 1000000000);
ALTER TABLE "balance_check_ins" ADD CONSTRAINT "balance_check_ins_opening_check" CHECK ("opening_balance_mkd" IS NULL OR "opening_balance_mkd" BETWEEN -1000000000 AND 1000000000);

-- Row level security, like every table (see docs/adr/006-user-data-isolation.md).
ALTER TABLE "balance_check_ins" ENABLE ROW LEVEL SECURITY;
