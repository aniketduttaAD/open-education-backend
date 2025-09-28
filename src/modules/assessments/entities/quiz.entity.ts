import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, OneToMany, ManyToOne, JoinColumn } from 'typeorm';
import { QuizQuestion } from './quiz-question.entity';
import { CourseSection } from '../../courses/entities/course-section.entity';

@Entity('quizzes')
export class Quiz {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'course_id', type: 'uuid' })
  course_id!: string;

  @Column({ name: 'section_id', type: 'uuid' })
  section_id!: string;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @CreateDateColumn({ name: 'created_at' })
  created_at!: Date;

  @OneToMany(() => QuizQuestion, (question) => question.quiz)
  questions!: QuizQuestion[];

  @ManyToOne(() => CourseSection, (section) => section.quizzes)
  @JoinColumn({ name: 'section_id' })
  section?: CourseSection;
}
