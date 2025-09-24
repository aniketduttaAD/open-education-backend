import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('learning_analytics')
@Index(['user_id', 'date'])
@Index(['course_id', 'date'])
export class LearningAnalytics {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  user_id!: string;

  @Column({ type: 'uuid', nullable: true })
  course_id?: string;

  @Column({ type: 'uuid', nullable: true })
  topic_id?: string;

  @Column({ type: 'date' })
  date!: Date;

  @Column({ type: 'int', default: 0 })
  time_spent_minutes!: number;

  @Column({ type: 'int', default: 0 })
  videos_watched!: number;

  @Column({ type: 'int', default: 0 })
  quizzes_completed!: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  average_quiz_score!: number;

  @Column({ type: 'int', default: 0 })
  ai_buddy_interactions!: number;

  @Column({ type: 'int', default: 0 })
  tokens_used!: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  progress_percentage!: number;

  @Column({ type: 'jsonb', nullable: true })
  engagement_metrics?: Record<string, any>;

  @CreateDateColumn({ type: 'timestamp with time zone', default: () => 'now()' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone', default: () => 'now()' })
  updated_at!: Date;
}
