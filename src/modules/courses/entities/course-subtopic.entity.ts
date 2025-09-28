import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { CourseSection } from './course-section.entity';

@Entity('course_subtopics')
export class CourseSubtopic {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  section_id!: string;

  @Column({ type: 'integer' })
  index!: number;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  markdown_path?: string;

  @Column({ type: 'text', nullable: true })
  transcript_path?: string;

  @Column({ type: 'text', nullable: true })
  audio_path?: string;

  @Column({ type: 'text', nullable: true })
  video_url?: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  status?: string;

  @CreateDateColumn({ type: 'timestamp with time zone', default: () => 'now()' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone', default: () => 'now()' })
  updated_at!: Date;

  // Relations
  @ManyToOne(() => CourseSection, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'section_id' })
  section?: CourseSection;
}
