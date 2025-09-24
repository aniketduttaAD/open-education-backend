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
import { Course } from './course.entity';

export type EnrollmentStatus = 'active' | 'completed' | 'dropped' | 'suspended';

@Entity('course_enrollments')
export class CourseEnrollment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  student_id!: string;

  @Column({ type: 'uuid' })
  course_id!: string;

  @Column({ type: 'varchar', length: 20, default: 'active' })
  status!: EnrollmentStatus;

  @Column({ type: 'integer', default: 0 })
  progress_percentage!: number;

  @Column({ type: 'integer', default: 0 })
  completed_topics!: number;

  @Column({ type: 'integer', default: 0 })
  completed_subtopics!: number;

  @Column({ type: 'timestamp with time zone', nullable: true })
  started_at?: Date;

  @Column({ type: 'timestamp with time zone', nullable: true })
  completed_at?: Date;

  @Column({ type: 'timestamp with time zone', nullable: true })
  last_accessed_at?: Date;

  @CreateDateColumn({ type: 'timestamp with time zone', default: () => 'now()' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone', default: () => 'now()' })
  updated_at!: Date;

  // Relations
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'student_id' })
  student?: User;

  @ManyToOne(() => Course, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'course_id' })
  course?: Course;
}
