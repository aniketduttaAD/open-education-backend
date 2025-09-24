import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { CourseTopic } from '../../courses/entities/course-topic.entity';

export type QuizType = 'multiple_choice' | 'true_false' | 'short_answer' | 'essay';
export type QuizDifficulty = 'beginner' | 'intermediate' | 'advanced';

@Entity('quizzes')
export class Quiz {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  topic_id!: string;

  @Column({ type: 'varchar', length: 200 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({
    type: 'enum',
    enum: ['multiple_choice', 'true_false', 'short_answer', 'essay'],
    default: 'multiple_choice',
  })
  type!: QuizType;

  @Column({
    type: 'enum',
    enum: ['beginner', 'intermediate', 'advanced'],
    default: 'intermediate',
  })
  difficulty!: QuizDifficulty;

  @Column({ type: 'integer', default: 0 })
  time_limit_minutes!: number;

  @Column({ type: 'integer', default: 0 })
  total_questions!: number;

  @Column({ type: 'integer', default: 0 })
  passing_score!: number;

  @Column({ type: 'integer', default: 0 })
  max_attempts!: number;

  @Column({ type: 'boolean', default: true })
  is_active!: boolean;

  @Column({ type: 'jsonb', nullable: true })
  questions?: Array<{
    id: string;
    question: string;
    type: QuizType;
    options?: string[];
    correct_answer: string | string[];
    explanation?: string;
    points: number;
  }>;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: {
    tags?: string[];
    learning_objectives?: string[];
    prerequisites?: string[];
  };

  @CreateDateColumn({ type: 'timestamp with time zone', default: () => 'now()' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone', default: () => 'now()' })
  updated_at!: Date;

  // Relations
  @ManyToOne(() => CourseTopic, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'topic_id' })
  topic?: CourseTopic;
}
