/*
  Warnings:

  - You are about to drop the column `workerId` on the `Order` table. All the data in the column will be lost.
  - You are about to drop the `Worker` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('AVAILABLE', 'BUSY', 'DISABLED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "OrderStatus" ADD VALUE 'PENDING_FUND';
ALTER TYPE "OrderStatus" ADD VALUE 'RETRY';

-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT "Order_workerId_fkey";

-- AlterTable
ALTER TABLE "Order" DROP COLUMN "workerId",
ADD COLUMN     "accountId" TEXT;

-- DropTable
DROP TABLE "Worker";

-- DropEnum
DROP TYPE "WorkerStatus";

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "keyReference" TEXT NOT NULL,
    "status" "AccountStatus" NOT NULL DEFAULT 'AVAILABLE',
    "nonce" INTEGER NOT NULL DEFAULT 0,
    "balance" TEXT NOT NULL DEFAULT '0',
    "totalMinted" INTEGER NOT NULL DEFAULT 0,
    "failedTransactions" INTEGER NOT NULL DEFAULT 0,
    "successfulTransactions" INTEGER NOT NULL DEFAULT 0,
    "totalGasUsed" TEXT NOT NULL DEFAULT '0',
    "lastUsed" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Account_address_key" ON "Account"("address");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
