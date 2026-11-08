-- CreateEnum
CREATE TYPE "transaction_kind" AS ENUM ('expense', 'cash_withdrawal');

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "kind" "transaction_kind" NOT NULL DEFAULT 'expense';
