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
import { CourseSubtopic } from '../../courses/entities/course-subtopic.entity';
import { CourseEnrollment } from '../../courses/entities/course-enrollment.entity';

export type VideoStatus = 'not_started' | 'started' | 'in_progress' | 'completed';

@Entity('video_progress')
export class VideoProgress {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  student_id!: string;

  @Column({ type: 'uuid' })
  subtopic_id!: string;

  @Column({ type: 'uuid' })
  enrollment_id!: string;

  @Column({
    type: 'enum',
    enum: ['not_started', 'started', 'in_progress', 'completed'],
    default: 'not_started',
  })
  status!: VideoStatus;

  @Column({ type: 'integer', default: 0 })
  current_time_seconds!: number;

  @Column({ type: 'integer', default: 0 })
  total_duration_seconds!: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  progress_percentage!: number;

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 1.0 })
  playback_speed!: number;

  @Column({ type: 'integer', default: 0 })
  skip_attempts!: number;

  @Column({ type: 'integer', default: 0 })
  max_skip_attempts!: number;

  @Column({ type: 'timestamp with time zone', nullable: true })
  started_at?: Date;

  @Column({ type: 'timestamp with time zone', nullable: true })
  completed_at?: Date;

  @Column({ type: 'timestamp with time zone', nullable: true })
  last_watched_at?: Date;

  @Column({ type: 'integer', default: 0 })
  total_watch_time_seconds!: number;

  @Column({ type: 'jsonb', nullable: true })
  watch_history?: Array<{
    timestamp: string;
    current_time: number;
    duration: number;
    action: 'play' | 'pause' | 'seek' | 'complete';
  }>;

  @Column({ type: 'jsonb', nullable: true })
  integrity_checks?: {
    total_play_time: number;
    expected_play_time: number;
    skip_penalty: number;
    integrity_score: number;
  };

  @CreateDateColumn({ type: 'timestamp with time zone', default: () => 'now()' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone', default: () => 'now()' })
  updated_at!: Date;

  // Relations
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'student_id' })
  student?: User;

  @ManyToOne(() => CourseSubtopic, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'subtopic_id' })
  subtopic?: CourseSubtopic;

  @ManyToOne(() => CourseEnrollment, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'enrollment_id' })
  enrollment?: CourseEnrollment;
}
