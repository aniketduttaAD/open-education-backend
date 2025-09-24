import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { Order } from './order.entity';

export type PayoutStatus = 'pending' | 'processing' | 'paid' | 'failed';

@Entity('tutor_earnings')
export class TutorEarnings {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tutor_id' })
  tutorId!: string;

  @Column({ name: 'order_id' })
  orderId!: string;

  @Column({ name: 'course_id', nullable: true })
  courseId?: string;

  @Column({ name: 'gross_amount', type: 'bigint' })
  grossAmount!: number; // Amount in paise

  @Column({ name: 'platform_commission', type: 'bigint' })
  platformCommission!: number; // 30% commission in paise

  @Column({ name: 'tutor_earnings', type: 'bigint' })
  tutorEarnings!: number; // 70% earnings in paise

  @Column({
    name: 'payout_status',
    type: 'enum',
    enum: ['pending', 'processing', 'paid', 'failed'],
    default: 'pending',
  })
  payoutStatus!: PayoutStatus;

  @Column({ name: 'payout_date', type: 'date', nullable: true })
  payoutDate?: Date;

  @Column({ name: 'razorpay_payout_id', nullable: true })
  razorpayPayoutId?: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp with time zone' })
  updatedAt!: Date;

  // Relations
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tutor_id' })
  tutor!: User;

  @ManyToOne(() => Order, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order!: Order;

  // Business logic methods
  getGrossAmountInRupees(): number {
    return this.grossAmount / 100;
  }

  getCommissionInRupees(): number {
    return this.platformCommission / 100;
  }

  getEarningsInRupees(): number {
    return this.tutorEarnings / 100;
  }

  isPaid(): boolean {
    return this.payoutStatus === 'paid';
  }

  isPending(): boolean {
    return this.payoutStatus === 'pending';
  }
}