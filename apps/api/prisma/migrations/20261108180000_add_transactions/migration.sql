-- CreateTable
CREATE TABLE "transactions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "amount_mkd" INTEGER NOT NULL,
    "occurred_on" DATE NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "transactions_user_id_occurred_on_idx" ON "transactions"("user_id", "occurred_on" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "categories_id_user_id_key" ON "categories"("id", "user_id");

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_user_id_fkey" FOREIGN KEY ("category_id", "user_id") REFERENCES "categories"("id", "user_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- Rules the application also checks; the database refuses bad data even if a bug slips through.
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_amount_mkd_check" CHECK ("amount_mkd" >= 1 AND "amount_mkd" <= 100000000);
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_note_length_check" CHECK ("note" IS NULL OR char_length("note") <= 200);

-- Block Supabase's public data API (see 20261107230000_enable_rls).
ALTER TABLE "transactions" ENABLE ROW LEVEL SECURITY;
