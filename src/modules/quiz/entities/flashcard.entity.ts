import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { CourseSubtopic } from '../../courses/entities/course-subtopic.entity';

export type FlashcardType = 'basic' | 'cloze' | 'image' | 'audio';

@Entity('flashcards')
export class Flashcard {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  subtopic_id!: string;

  @Column({ type: 'varchar', length: 200 })
  title!: string;

  @Column({ type: 'text' })
  front_content!: string;

  @Column({ type: 'text' })
  back_content!: string;

  @Column({
    type: 'enum',
    enum: ['basic', 'cloze', 'image', 'audio'],
    default: 'basic',
  })
  type!: FlashcardType;

  @Column({ type: 'integer', default: 1 })
  difficulty_level!: number;

  @Column({ type: 'integer', default: 0 })
  review_count!: number;

  @Column({ type: 'integer', default: 0 })
  correct_count!: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  success_rate!: number;

  @Column({ type: 'timestamp with time zone', nullable: true })
  last_reviewed_at?: Date;

  @Column({ type: 'timestamp with time zone', nullable: true })
  next_review_at?: Date;

  @Column({ type: 'integer', default: 0 })
  interval_days!: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 2.5 })
  ease_factor!: number;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: {
    tags?: string[];
    image_url?: string;
    audio_url?: string;
    hints?: string[];
  };

  @Column({ type: 'boolean', default: true })
  is_active!: boolean;

  @CreateDateColumn({ type: 'timestamp with time zone', default: () => 'now()' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone', default: () => 'now()' })
  updated_at!: Date;

  // Relations
  @ManyToOne(() => CourseSubtopic, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'subtopic_id' })
  subtopic?: CourseSubtopic;
}
