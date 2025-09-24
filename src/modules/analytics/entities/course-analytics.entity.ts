import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('course_analytics')
@Index(['course_id', 'date'])
export class CourseAnalytics {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  course_id!: string;

  @Column({ type: 'date' })
  date!: Date;

  @Column({ type: 'int', default: 0 })
  enrollment_count!: number;

  @Column({ type: 'int', default: 0 })
  new_enrollments!: number;

  @Column({ type: 'int', default: 0 })
  active_students!: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  completion_rate!: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  rating!: number;

  @Column({ type: 'int', default: 0 })
  total_reviews!: number;

  @Column({ type: 'int', default: 0 })
  total_revenue!: number;

  @Column({ type: 'int', default: 0 })
  video_views!: number;

  @Column({ type: 'int', default: 0 })
  quiz_attempts!: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  average_quiz_score!: number;

  @Column({ type: 'jsonb', nullable: true })
  engagement_metrics?: Record<string, any>;

  @CreateDateColumn({ type: 'timestamp with time zone', default: () => 'now()' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone', default: () => 'now()' })
  updated_at!: Date;
}
