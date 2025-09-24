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

@Entity('tutor_leaderboard')
export class TutorLeaderboard {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  user_id!: string;

  @Column({ type: 'integer', default: 0 })
  total_courses!: number;

  @Column({ type: 'integer', default: 0 })
  total_students!: number;

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 0 })
  average_rating!: number;

  @Column({ type: 'integer', default: 0 })
  total_ratings!: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  total_earnings!: number;

  @Column({ type: 'integer', default: 0 })
  completion_rate!: number;

  @Column({ type: 'integer', default: 0 })
  rank_position!: number;

  @Column({ type: 'integer', default: 0 })
  previous_rank!: number;

  @Column({ type: 'integer', default: 0 })
  rank_change!: number;

  @CreateDateColumn({ type: 'timestamp with time zone', default: () => 'now()' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone', default: () => 'now()' })
  updated_at!: Date;

  // Relations
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;
}
