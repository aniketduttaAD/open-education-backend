import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { CourseTopic } from './course-topic.entity';

export type SubtopicType = 'video' | 'text' | 'quiz' | 'assignment' | 'resource';

@Entity('course_subtopics')
export class CourseSubtopic {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  topic_id!: string;

  @Column({ type: 'varchar', length: 200 })
  title!: string;

  @Column({ type: 'text' })
  content!: string;

  @Column({ type: 'varchar', length: 20 })
  type!: SubtopicType;

  @Column({ type: 'integer' })
  order_index!: number;

  @Column({ type: 'integer', default: 0 })
  duration_minutes!: number;

  @Column({ type: 'varchar', length: 500, nullable: true })
  video_url?: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  resource_url?: string;

  @Column({ type: 'jsonb', nullable: true })
  quiz_data?: Record<string, any>;

  @Column({ type: 'boolean', default: false })
  is_required!: boolean;

  @CreateDateColumn({ type: 'timestamp with time zone', default: () => 'now()' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone', default: () => 'now()' })
  updated_at!: Date;

  // Relations
  @ManyToOne(() => CourseTopic, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'topic_id' })
  topic?: CourseTopic;
}
