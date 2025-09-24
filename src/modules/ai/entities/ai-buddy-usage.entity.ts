import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';

export type ConversationType = 'course_help' | 'general_question' | 'study_guidance' | 'concept_explanation';

@Entity('ai_buddy_usage')
export class AIBuddyUsage {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  user_id!: string;

  @Column({ type: 'uuid' })
  course_id!: string;

  @Column({ type: 'varchar', length: 50 })
  conversation_type!: ConversationType;

  @Column({ type: 'text' })
  user_message!: string;

  @Column({ type: 'text' })
  ai_response!: string;

  @Column({ type: 'integer', default: 0 })
  tokens_used!: number;

  @Column({ type: 'integer', default: 0 })
  response_time_ms!: number;

  @Column({ type: 'decimal', precision: 3, scale: 2, nullable: true })
  quality_score?: number;

  @Column({ type: 'jsonb', nullable: true })
  context_data?: Record<string, any>;

  @Column({ type: 'varchar', length: 500, nullable: true })
  source_documents?: string[];

  @CreateDateColumn({ type: 'timestamp with time zone', default: () => 'now()' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone', default: () => 'now()' })
  updated_at!: Date;

  // Relations
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;
}
