/*
  Warnings:

  - You are about to drop the column `status` on the `OrderCourse` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "OrderCourse" DROP CONSTRAINT "OrderCourse_kitchenStationId_fkey";

-- AlterTable
ALTER TABLE "OrderCourse" DROP COLUMN "status",
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "firedAt" TIMESTAMP(3),
ALTER COLUMN "kitchenStationId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "OrderCourse" ADD CONSTRAINT "OrderCourse_kitchenStationId_fkey" FOREIGN KEY ("kitchenStationId") REFERENCES "KitchenStation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
