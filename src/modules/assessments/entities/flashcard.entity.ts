import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { CourseSection } from '../../courses/entities/course-section.entity';

@Entity('flashcards')
export class Flashcard {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'course_id', type: 'uuid' })
  course_id!: string;

  @Column({ name: 'section_id', type: 'uuid' })
  section_id!: string;

  @Column({ type: 'integer' })
  index!: number;

  @Column({ type: 'text' })
  front!: string;

  @Column({ type: 'text' })
  back!: string;

  @CreateDateColumn({ name: 'created_at' })
  created_at!: Date;

  @ManyToOne(() => CourseSection, (section) => section.flashcards)
  @JoinColumn({ name: 'section_id' })
  section?: CourseSection;
}
