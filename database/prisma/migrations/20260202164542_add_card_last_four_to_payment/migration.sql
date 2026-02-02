-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "cardLastFour" TEXT,
ADD COLUMN     "processedAt" TIMESTAMP(3);
