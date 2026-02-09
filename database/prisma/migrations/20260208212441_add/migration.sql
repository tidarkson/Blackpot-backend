-- AlterTable
ALTER TABLE "CashSession" ADD COLUMN     "actualCard" DECIMAL(12,2),
ADD COLUMN     "cardDiscrepancy" DECIMAL(12,2),
ADD COLUMN     "cashDenominations" JSONB;

-- AlterTable
ALTER TABLE "Shift" ADD COLUMN     "shiftType" TEXT;
