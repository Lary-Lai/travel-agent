-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('PROCESSING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "RefundReason" AS ENUM ('USER_CANCELLED', 'HOST_CANCELLED');

-- CreateTable
CREATE TABLE "Refund" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "RefundStatus" NOT NULL DEFAULT 'PROCESSING',
    "reason" "RefundReason" NOT NULL DEFAULT 'USER_CANCELLED',
    "tier" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "tradeNo" TEXT,
    "note" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Refund_bookingId_idx" ON "Refund"("bookingId");

-- CreateIndex
CREATE INDEX "Refund_status_idx" ON "Refund"("status");

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
