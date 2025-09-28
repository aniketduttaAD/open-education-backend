import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Course } from './course.entity';
import { User } from '../../auth/entities/user.entity';

@Entity('course_roadmaps')
export class CourseRoadmap {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  course_id!: string;

  @Column({ type: 'uuid' })
  tutor_user_id!: string;

  @Column({ type: 'jsonb' })
  roadmap_data!: any;

  @Column({ type: 'varchar', length: 50, default: 'draft' })
  status!: string; // draft, finalizing, finalized

  @Column({ type: 'varchar', length: 255, nullable: true })
  redis_key?: string;

  @CreateDateColumn({ type: 'timestamp with time zone', default: () => 'now()' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone', default: () => 'now()' })
  updated_at!: Date;

  @Column({ type: 'timestamp with time zone', nullable: true })
  finalized_at?: Date;

  // Relations
  @ManyToOne(() => Course, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'course_id' })
  course?: Course;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tutor_user_id' })
  tutor?: User;
}