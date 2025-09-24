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

@Entity('student_login_streaks')
export class StudentLoginStreak {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  user_id!: string;

  @Column({ type: 'integer', default: 0 })
  current_streak!: number;

  @Column({ type: 'integer', default: 0 })
  best_streak!: number;

  @Column({ type: 'date' })
  last_login_date!: Date;

  @Column({ type: 'integer', default: 0 })
  total_login_days!: number;

  @Column({ type: 'integer', default: 0 })
  streak_bonus_multiplier!: number;

  @CreateDateColumn({ type: 'timestamp with time zone', default: () => 'now()' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone', default: () => 'now()' })
  updated_at!: Date;

  // Relations
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;
}
