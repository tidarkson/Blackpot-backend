-- CreateTable
CREATE TABLE "SplitPayment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "billNumber" INTEGER NOT NULL,
    "personNumber" INTEGER NOT NULL,
    "subtotal" DECIMAL(10,2) NOT NULL,
    "tax" DECIMAL(10,2) NOT NULL,
    "total" DECIMAL(10,2) NOT NULL,
    "paid" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "remaining" DECIMAL(10,2) NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "splitType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SplitPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SplitPaymentItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "splitPaymentId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "SplitPaymentItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SplitPaymentRecord" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "splitPaymentId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'COMPLETED',
    "reference" TEXT,
    "cardLastFour" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SplitPaymentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SplitPayment_orderId_idx" ON "SplitPayment"("orderId");

-- CreateIndex
CREATE INDEX "SplitPayment_tenantId_idx" ON "SplitPayment"("tenantId");

-- CreateIndex
CREATE INDEX "SplitPayment_status_idx" ON "SplitPayment"("status");

-- CreateIndex
CREATE INDEX "SplitPayment_createdAt_idx" ON "SplitPayment"("createdAt");

-- CreateIndex
CREATE INDEX "SplitPayment_tenantId_orderId_status_idx" ON "SplitPayment"("tenantId", "orderId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SplitPayment_orderId_billNumber_key" ON "SplitPayment"("orderId", "billNumber");

-- CreateIndex
CREATE INDEX "SplitPaymentItem_splitPaymentId_idx" ON "SplitPaymentItem"("splitPaymentId");

-- CreateIndex
CREATE INDEX "SplitPaymentItem_orderItemId_idx" ON "SplitPaymentItem"("orderItemId");

-- CreateIndex
CREATE INDEX "SplitPaymentItem_tenantId_idx" ON "SplitPaymentItem"("tenantId");

-- CreateIndex
CREATE INDEX "SplitPaymentRecord_splitPaymentId_idx" ON "SplitPaymentRecord"("splitPaymentId");

-- CreateIndex
CREATE INDEX "SplitPaymentRecord_tenantId_idx" ON "SplitPaymentRecord"("tenantId");

-- CreateIndex
CREATE INDEX "SplitPaymentRecord_method_idx" ON "SplitPaymentRecord"("method");

-- CreateIndex
CREATE INDEX "SplitPaymentRecord_status_idx" ON "SplitPaymentRecord"("status");

-- AddForeignKey
ALTER TABLE "SplitPayment" ADD CONSTRAINT "SplitPayment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SplitPayment" ADD CONSTRAINT "SplitPayment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SplitPaymentItem" ADD CONSTRAINT "SplitPaymentItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SplitPaymentItem" ADD CONSTRAINT "SplitPaymentItem_splitPaymentId_fkey" FOREIGN KEY ("splitPaymentId") REFERENCES "SplitPayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SplitPaymentItem" ADD CONSTRAINT "SplitPaymentItem_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SplitPaymentRecord" ADD CONSTRAINT "SplitPaymentRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SplitPaymentRecord" ADD CONSTRAINT "SplitPaymentRecord_splitPaymentId_fkey" FOREIGN KEY ("splitPaymentId") REFERENCES "SplitPayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
