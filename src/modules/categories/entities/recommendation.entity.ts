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
import { Course } from '../../courses/entities/course.entity';

export type RecommendationType = 'similar_courses' | 'trending' | 'personalized' | 'category_based' | 'collaborative_filtering';
export type RecommendationStatus = 'active' | 'inactive' | 'expired';

@Entity('recommendations')
export class Recommendation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  user_id!: string;

  @Column({ type: 'uuid' })
  course_id!: string;

  @Column({
    type: 'enum',
    enum: ['similar_courses', 'trending', 'personalized', 'category_based', 'collaborative_filtering'],
  })
  type!: RecommendationType;

  @Column({
    type: 'enum',
    enum: ['active', 'inactive', 'expired'],
    default: 'active',
  })
  status!: RecommendationStatus;

  @Column({ type: 'decimal', precision: 5, scale: 4, default: 0 })
  score!: number;

  @Column({ type: 'integer', default: 0 })
  position!: number;

  @Column({ type: 'text', nullable: true })
  reason?: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: {
    algorithm_version?: string;
    confidence_score?: number;
    factors?: string[];
    generated_at?: string;
  };

  @Column({ type: 'timestamp with time zone', nullable: true })
  expires_at?: Date;

  @Column({ type: 'boolean', default: false })
  is_clicked!: boolean;

  @Column({ type: 'timestamp with time zone', nullable: true })
  clicked_at?: Date;

  @CreateDateColumn({ type: 'timestamp with time zone', default: () => 'now()' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone', default: () => 'now()' })
  updated_at!: Date;

  // Relations
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @ManyToOne(() => Course, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'course_id' })
  course?: Course;
}
