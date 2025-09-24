import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Course } from '../../courses/entities/course.entity';
import { CourseTopic } from '../../courses/entities/course-topic.entity';
import { CourseSubtopic } from '../../courses/entities/course-subtopic.entity';

export type ContentType = 'course' | 'topic' | 'subtopic' | 'quiz' | 'flashcard' | 'transcript' | 'notes';

@Entity('vector_embeddings')
@Index(['course_id', 'content_type'])
@Index(['content_id', 'content_type'])
export class VectorEmbedding {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  course_id!: string;

  @Column({ type: 'uuid', nullable: true })
  content_id?: string;

  @Column({
    type: 'enum',
    enum: ['course', 'topic', 'subtopic', 'quiz', 'flashcard', 'transcript', 'notes'],
  })
  content_type!: ContentType;

  @Column({ type: 'text' })
  content_text!: string;

  @Column({ type: 'text' })
  embedding!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  title?: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: {
    difficulty_level?: string;
    keywords?: string[];
    language?: string;
    source_url?: string;
    created_by?: string;
    version?: string;
  };

  @Column({ type: 'boolean', default: true })
  is_active!: boolean;

  @CreateDateColumn({ type: 'timestamp with time zone', default: () => 'now()' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone', default: () => 'now()' })
  updated_at!: Date;

  // Relations
  @ManyToOne(() => Course, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'course_id' })
  course?: Course;

  @ManyToOne(() => CourseTopic, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'content_id' })
  topic?: CourseTopic;

  @ManyToOne(() => CourseSubtopic, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'content_id' })
  subtopic?: CourseSubtopic;
}
