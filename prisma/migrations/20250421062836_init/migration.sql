-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "BatchStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "WorkerStatus" AS ENUM ('AVAILABLE', 'BUSY', 'OFFLINE');

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "mintToAddress" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "image_cid" TEXT NOT NULL,
    "attributes" JSONB,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "transactionHash" TEXT,
    "tokenId" TEXT,
    "errorMessage" TEXT,
    "workerId" TEXT,
    "batchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Batch" (
    "id" TEXT NOT NULL,
    "status" "BatchStatus" NOT NULL DEFAULT 'PENDING',
    "totalOrders" INTEGER NOT NULL DEFAULT 0,
    "completedOrders" INTEGER NOT NULL DEFAULT 0,
    "failedOrders" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Worker" (
    "id" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "keyReference" TEXT NOT NULL,
    "status" "WorkerStatus" NOT NULL DEFAULT 'AVAILABLE',
    "nonce" INTEGER NOT NULL DEFAULT 0,
    "balance" TEXT NOT NULL DEFAULT '0',
    "totalMinted" INTEGER NOT NULL DEFAULT 0,
    "failedTransactions" INTEGER NOT NULL DEFAULT 0,
    "successfulTransactions" INTEGER NOT NULL DEFAULT 0,
    "totalGasUsed" TEXT NOT NULL DEFAULT '0',
    "lastUsed" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Worker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Worker_address_key" ON "Worker"("address");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_key_key" ON "ApiKey"("key");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE SET NULL ON UPDATE CASCADE;
