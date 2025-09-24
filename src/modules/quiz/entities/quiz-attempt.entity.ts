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
import { Quiz } from './quiz.entity';
import { CourseEnrollment } from '../../courses/entities/course-enrollment.entity';

export type QuizAttemptStatus = 'not_started' | 'in_progress' | 'passed' | 'failed' | 'abandoned';

@Entity('quiz_attempts')
export class QuizAttempt {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  student_id!: string;

  @Column({ type: 'uuid' })
  quiz_id!: string;

  @Column({ type: 'uuid', nullable: true })
  enrollment_id?: string;

  @Column({
    type: 'enum',
    enum: ['not_started', 'in_progress', 'passed', 'failed', 'abandoned'],
    default: 'not_started',
  })
  status!: QuizAttemptStatus;

  @Column({ type: 'integer', default: 0 })
  score!: number;

  @Column({ type: 'integer', default: 0 })
  total_questions!: number;

  @Column({ type: 'integer', default: 0 })
  correct_answers!: number;

  @Column({ type: 'integer', default: 0 })
  attempt_number!: number;

  @Column({ type: 'timestamp with time zone', nullable: true })
  started_at?: Date;

  @Column({ type: 'timestamp with time zone', nullable: true })
  completed_at?: Date;

  @Column({ type: 'integer', default: 0 })
  time_taken_seconds!: number;

  @Column({ type: 'jsonb', nullable: true })
  answers?: Array<{
    question_id: string;
    answer: string | string[];
    is_correct: boolean;
    points_earned: number;
    time_spent_seconds: number;
  }>;

  @Column({ type: 'jsonb', nullable: true })
  feedback?: {
    overall_feedback?: string;
    strengths?: string[];
    areas_for_improvement?: string[];
    recommended_resources?: string[];
  };

  @CreateDateColumn({ type: 'timestamp with time zone', default: () => 'now()' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone', default: () => 'now()' })
  updated_at!: Date;

  // Relations
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'student_id' })
  student?: User;

  @ManyToOne(() => Quiz, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'quiz_id' })
  quiz?: Quiz;

  @ManyToOne(() => CourseEnrollment, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'enrollment_id' })
  enrollment?: CourseEnrollment;
}
