import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum WalletStatus {
  AVAILABLE = 'available',
  BUSY = 'busy',
  DISABLED = 'disabled',
}

@Entity('wallets')
export class Wallet {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 42 })
  address: string;

  @Column({ type: 'varchar', length: 255, select: false })
  privateKey: string;

  @Column({
    type: 'enum',
    enum: WalletStatus,
    default: WalletStatus.AVAILABLE,
  })
  status: WalletStatus;

  @Column({ type: 'int', default: 0 })
  nonce: number;

  @Column({ type: 'int', default: 0 })
  totalMinted: number;

  @Column({ type: 'int', default: 0 })
  failedTransactions: number;

  @Column({ type: 'int', default: 0 })
  successfulTransactions: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  totalGasUsed: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

export enum WorkerStatus {
  AVAILABLE = 'AVAILABLE',
  BUSY = 'BUSY',
  DISABLED = 'DISABLED',
}

@Entity('workers')
export class Worker {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  address: string;

  @Column()
  keyReference: string;

  @Column({
    type: 'enum',
    enum: WorkerStatus,
    default: WorkerStatus.AVAILABLE,
  })
  status: WorkerStatus;

  @Column({ default: 0 })
  nonce: number;

  @Column({ default: '0' })
  balance: string;

  @Column({ default: 0 })
  totalMinted: number;

  @Column({ default: 0 })
  failedTransactions: number;

  @Column({ default: 0 })
  successfulTransactions: number;

  @Column({ default: '0' })
  totalGasUsed: string;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;
}
