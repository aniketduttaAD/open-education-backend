import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Course } from './course.entity';
import { CourseRoadmap } from './course-roadmap.entity';

@Entity('course_generation_progress')
export class CourseGenerationProgress {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  course_id!: string;

  @Column({ type: 'uuid' })
  roadmap_id!: string;

  @Column({ type: 'varchar', length: 50, default: 'pending' })
  status!: string; // pending, processing, completed, failed

  @Column({ type: 'varchar', length: 100, nullable: true })
  current_step?: string; // e.g., "generating_md_files", "creating_transcripts"

  @Column({ type: 'integer', default: 0 })
  progress_percentage!: number; // 0-100

  @Column({ type: 'integer', default: 0 })
  current_section_index!: number;

  @Column({ type: 'integer', default: 0 })
  current_subtopic_index!: number;

  @Column({ type: 'integer', nullable: true })
  total_sections?: number;

  @Column({ type: 'integer', nullable: true })
  total_subtopics?: number;

  @Column({ type: 'integer', nullable: true })
  estimated_time_remaining?: number; // in minutes

  @Column({ type: 'jsonb', default: '[]' })
  error_log!: any[]; // Array of errors

  @Column({ type: 'integer', default: 0 })
  retry_count!: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  websocket_session_id?: string;

  @Column({ type: 'timestamp with time zone', nullable: true })
  started_at?: Date;

  @Column({ type: 'timestamp with time zone', nullable: true })
  completed_at?: Date;

  @CreateDateColumn({ type: 'timestamp with time zone', default: () => 'now()' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone', default: () => 'now()' })
  updated_at!: Date;

  // Relations
  @ManyToOne(() => Course, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'course_id' })
  course?: Course;

  @ManyToOne(() => CourseRoadmap, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'roadmap_id' })
  roadmap?: CourseRoadmap;
}