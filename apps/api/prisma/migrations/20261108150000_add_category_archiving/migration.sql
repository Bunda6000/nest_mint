-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "archived_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "category_groups" ADD COLUMN     "archived_at" TIMESTAMP(3);
