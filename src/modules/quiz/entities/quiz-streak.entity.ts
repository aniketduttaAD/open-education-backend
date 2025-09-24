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

@Entity('quiz_streaks')
export class QuizStreak {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  student_id!: string;

  @Column({ type: 'integer', default: 0 })
  current_streak!: number;

  @Column({ type: 'integer', default: 0 })
  best_streak!: number;

  @Column({ type: 'integer', default: 0 })
  total_quizzes_completed!: number;

  @Column({ type: 'integer', default: 0 })
  total_quizzes_passed!: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  average_score!: number;

  @Column({ type: 'timestamp with time zone', nullable: true })
  last_quiz_date?: Date;

  @Column({ type: 'timestamp with time zone', nullable: true })
  streak_start_date?: Date;

  @Column({ type: 'jsonb', nullable: true })
  streak_history?: Array<{
    date: string;
    quizzes_completed: number;
    quizzes_passed: number;
    average_score: number;
  }>;

  @CreateDateColumn({ type: 'timestamp with time zone', default: () => 'now()' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone', default: () => 'now()' })
  updated_at!: Date;

  // Relations
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'student_id' })
  student?: User;
}
