import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Order } from './order.entity';

@Entity('order_payments')
export class OrderPayment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'order_id' })
  orderId!: string;

  @Column({ name: 'razorpay_payment_id', unique: true, nullable: true })
  razorpayPaymentId?: string;

  @Column({ name: 'razorpay_signature', nullable: true })
  razorpaySignature?: string;

  @Column({ name: 'payment_method', length: 50, nullable: true })
  paymentMethod?: string;

  @Column({ name: 'payment_captured', default: false })
  paymentCaptured!: boolean;

  @Column({ name: 'captured_at', type: 'timestamp with time zone', nullable: true })
  capturedAt?: Date;

  @Column({ name: 'gateway_response', type: 'jsonb', nullable: true })
  gatewayResponse?: any;

  @Column({ name: 'failure_reason', type: 'text', nullable: true })
  failureReason?: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp with time zone' })
  updatedAt!: Date;

  // Relations
  @ManyToOne(() => Order, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order!: Order;

  // Business logic methods
  isCaptured(): boolean {
    return this.paymentCaptured;
  }

  hasFailed(): boolean {
    return !!this.failureReason;
  }
}