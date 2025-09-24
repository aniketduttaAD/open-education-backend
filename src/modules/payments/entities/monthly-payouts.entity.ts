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

export type PayoutStatus = 'pending' | 'processing' | 'paid' | 'failed';

@Entity('monthly_payouts')
export class MonthlyPayouts {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tutor_id' })
  tutorId!: string;

  @Column({ name: 'month_year', length: 7 })
  monthYear!: string; // Format: '2024-01'

  @Column({ name: 'total_earnings', type: 'bigint' })
  totalEarnings!: number; // Total earnings for the month in paise

  @Column({ name: 'total_commission', type: 'bigint' })
  totalCommission!: number; // Total commission for the month in paise

  @Column({ name: 'net_payout', type: 'bigint' })
  netPayout!: number; // Net amount to be paid in paise

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

  @Column({ type: 'jsonb', nullable: true })
  bankDetails?: any; // Bank details used for payout

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp with time zone' })
  updatedAt!: Date;

  // Relations
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tutor_id' })
  tutor!: User;

  // Business logic methods
  getTotalEarningsInRupees(): number {
    return this.totalEarnings / 100;
  }

  getTotalCommissionInRupees(): number {
    return this.totalCommission / 100;
  }

  getNetPayoutInRupees(): number {
    return this.netPayout / 100;
  }

  isPaid(): boolean {
    return this.payoutStatus === 'paid';
  }

  isPending(): boolean {
    return this.payoutStatus === 'pending';
  }
}