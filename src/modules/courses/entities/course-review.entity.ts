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
import { User } from '../../auth/entities/user.entity';
import { Course } from './course.entity';
import { ReviewReply } from './review-reply.entity';

@Entity('course_reviews')
export class CourseReview {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  course_id!: string;

  @Column({ type: 'uuid' })
  student_id!: string;

  @Column({ type: 'integer', default: 0 })
  rating!: number;

  @Column({ type: 'text', nullable: true })
  comment?: string;

  @Column({ type: 'boolean', default: false })
  is_verified_purchase!: boolean;

  @Column({ type: 'boolean', default: true })
  is_public!: boolean;

  @Column({ type: 'integer', default: 0 })
  helpful_votes!: number;

  @Column({ type: 'integer', default: 0 })
  total_votes!: number;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: {
    pros?: string[];
    cons?: string[];
    would_recommend?: boolean;
    difficulty_rating?: number;
    content_quality?: number;
    instructor_rating?: number;
  };

  @CreateDateColumn({ type: 'timestamp with time zone', default: () => 'now()' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone', default: () => 'now()' })
  updated_at!: Date;

  // Relations
  @ManyToOne(() => Course, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'course_id' })
  course?: Course;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'student_id' })
  student?: User;

  @OneToMany(() => ReviewReply, reply => reply.review)
  replies?: ReviewReply[];
}
