import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

export enum OrderStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true, type: 'text' })
  description: string;

  @Column()
  image: string;

  @Column()
  mintToAddress: string;

  @Column({ type: 'jsonb', nullable: true })
  attributes: Record<string, any>;

  @Column({
    type: 'enum',
    enum: OrderStatus,
    default: OrderStatus.PENDING,
  })
  status: OrderStatus;

  @Column({ nullable: true })
  transactionHash: string;

  @Column({ nullable: true })
  tokenId: string;

  @Column({ nullable: true, type: 'text' })
  errorMessage: string;

  @Column({ nullable: true })
  batchId: string;

  @Column({ nullable: true })
  workerId: string;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;
}
