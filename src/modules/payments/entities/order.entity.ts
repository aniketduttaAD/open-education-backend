import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { OrderPayment } from './order-payment.entity';

export type OrderStatus = 'pending' | 'payment_verified' | 'captured' | 'failed';
export type OrderType = 'tutor_registration' | 'course_enrollment';

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id' })
  userId!: string;

  @Column({ type: 'bigint' })
  amount!: number; // Amount in paise

  @Column({ type: 'varchar', length: 3, default: 'INR' })
  currency!: string;

  @Column({ name: 'razorpay_order_id', unique: true, nullable: true })
  razorpayOrderId?: string;

  @Column({
    type: 'enum',
    enum: ['pending', 'payment_verified', 'captured', 'failed'],
    default: 'pending',
  })
  status!: OrderStatus;

  @Column({ nullable: true })
  receipt?: string;

  @Column({ name: 'order_type' })
  orderType!: OrderType;

  @Column({ name: 'course_id', nullable: true })
  courseId?: string;

  @Column({ name: 'tutor_id', nullable: true })
  tutorId?: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: any;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp with time zone' })
  updatedAt!: Date;

  // Relations
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @OneToMany(() => OrderPayment, (payment) => payment.order)
  payments?: OrderPayment[];

  // Business logic methods
  isPending(): boolean {
    return this.status === 'pending';
  }

  isPaymentVerified(): boolean {
    return this.status === 'payment_verified';
  }

  isCaptured(): boolean {
    return this.status === 'captured';
  }

  isFailed(): boolean {
    return this.status === 'failed';
  }

  getAmountInRupees(): number {
    return this.amount / 100;
  }

  getFormattedAmount(): string {
    return `${this.currency} ${this.getAmountInRupees().toFixed(2)}`;
  }
}
