import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Course } from './course.entity';
import { CourseSection } from './course-section.entity';
import { CourseSubtopic } from './course-subtopic.entity';

@Entity('embeddings')
export class Embeddings {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  course_id!: string;

  @Column({ type: 'uuid', nullable: true })
  section_id?: string;

  @Column({ type: 'uuid', nullable: true })
  subtopic_id?: string;

  @Column({ 
    type: 'enum', 
    enum: ['course', 'section', 'subtopic'],
    name: 'kind'
  })
  kind!: 'course' | 'section' | 'subtopic';

  @Column({ type: 'text', unique: true })
  content_hash!: string;

  @Column({ type: 'text' })
  embedding!: string;

  @CreateDateColumn({ type: 'timestamp with time zone', default: () => 'now()' })
  created_at!: Date;

  // Relations
  @ManyToOne(() => Course, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'course_id' })
  course?: Course;

  @ManyToOne(() => CourseSection, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'section_id' })
  section?: CourseSection;

  @ManyToOne(() => CourseSubtopic, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'subtopic_id' })
  subtopic?: CourseSubtopic;
}
