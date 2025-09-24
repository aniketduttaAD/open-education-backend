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

@Entity('student_token_allocations')
export class StudentTokenAllocation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  user_id!: string;

  @Column({ type: 'uuid' })
  course_id!: string;

  @Column({ type: 'integer', default: 1000 })
  tokens_allocated!: number;

  @Column({ type: 'integer', default: 0 })
  tokens_used!: number;

  @Column({ type: 'integer', default: 1000 })
  tokens_remaining!: number;

  @Column({ type: 'date' })
  allocation_month!: Date;

  @Column({ type: 'date' })
  reset_date!: Date;

  @Column({ type: 'boolean', default: false })
  is_reset!: boolean;

  @CreateDateColumn({ type: 'timestamp with time zone', default: () => 'now()' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone', default: () => 'now()' })
  updated_at!: Date;

  // Relations
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;
}
