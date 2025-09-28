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
import { Course } from './course.entity';
import { CourseSubtopic } from './course-subtopic.entity';
import { Quiz } from '../../assessments/entities/quiz.entity';
import { Flashcard } from '../../assessments/entities/flashcard.entity';

@Entity('course_sections')
export class CourseSection {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  course_id!: string;

  @Column({ type: 'integer' })
  index!: number;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @CreateDateColumn({ type: 'timestamp with time zone', default: () => 'now()' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone', default: () => 'now()' })
  updated_at!: Date;

  // Relations
  @ManyToOne(() => Course, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'course_id' })
  course?: Course;

  @OneToMany(() => CourseSubtopic, (subtopic) => subtopic.section)
  subtopics?: CourseSubtopic[];

  @OneToMany(() => Quiz, (quiz) => quiz.section)
  quizzes?: Quiz[];

  @OneToMany(() => Flashcard, (flashcard) => flashcard.section)
  flashcards?: Flashcard[];
}
