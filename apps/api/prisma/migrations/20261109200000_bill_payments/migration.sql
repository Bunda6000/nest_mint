-- AlterTable
ALTER TABLE "bills" ADD COLUMN     "actual_amount_mkd" INTEGER,
ADD COLUMN     "invoice_ref" TEXT,
ADD COLUMN     "transaction_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "bills_transaction_id_user_id_key" ON "bills"("transaction_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_id_user_id_key" ON "transactions"("id", "user_id");

-- AddForeignKey
ALTER TABLE "bills" ADD CONSTRAINT "bills_transaction_id_user_id_fkey" FOREIGN KEY ("transaction_id", "user_id") REFERENCES "transactions"("id", "user_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- Rules the application also checks; the database refuses bad data even if a bug slips through.
ALTER TABLE "bills" ADD CONSTRAINT "bills_actual_amount_check" CHECK ("actual_amount_mkd" IS NULL OR ("actual_amount_mkd" >= 1 AND "actual_amount_mkd" <= 100000000));
ALTER TABLE "bills" ADD CONSTRAINT "bills_invoice_ref_length_check" CHECK ("invoice_ref" IS NULL OR char_length(btrim("invoice_ref")) BETWEEN 1 AND 60);
