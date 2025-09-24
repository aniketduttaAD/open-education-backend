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

export type WithdrawalStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

@Entity('tutor_withdrawals')
export class TutorWithdrawal {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  user_id!: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount!: number;

  @Column({ type: 'varchar', length: 3, default: 'INR' })
  currency!: string;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status!: WithdrawalStatus;

  @Column({ type: 'varchar', length: 100 })
  bank_account_number!: string;

  @Column({ type: 'varchar', length: 20 })
  ifsc_code!: string;

  @Column({ type: 'varchar', length: 100 })
  bank_name!: string;

  @Column({ type: 'varchar', length: 100 })
  account_holder_name!: string;

  @Column({ type: 'text', nullable: true })
  failure_reason?: string;

  @Column({ type: 'uuid', nullable: true })
  processed_by?: string;

  @Column({ type: 'timestamp with time zone', nullable: true })
  processed_at?: Date;

  @Column({ type: 'varchar', length: 200, nullable: true })
  transaction_reference?: string;

  @CreateDateColumn({ type: 'timestamp with time zone', default: () => 'now()' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone', default: () => 'now()' })
  updated_at!: Date;

  // Relations
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;
}
