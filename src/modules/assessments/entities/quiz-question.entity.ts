import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Quiz } from './quiz.entity';

@Entity('quiz_questions')
export class QuizQuestion {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'quiz_id', type: 'uuid' })
  quiz_id!: string;

  @Column({ type: 'integer' })
  index!: number;

  @Column({ type: 'text' })
  question!: string;

  @Column({ type: 'jsonb' })
  options!: string[];

  @Column({ name: 'correct_index', type: 'integer' })
  correct_index!: number;

  @CreateDateColumn({ name: 'created_at' })
  created_at!: Date;

  @ManyToOne(() => Quiz, (quiz) => quiz.questions)
  @JoinColumn({ name: 'quiz_id' })
  quiz!: Quiz;
}
