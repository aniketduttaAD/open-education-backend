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

@Entity('course_completion_certificates')
export class CourseCompletionCertificate {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  student_id!: string;

  @Column({ type: 'uuid' })
  course_id!: string;

  @Column({ type: 'varchar', length: 200 })
  certificate_title!: string;

  @Column({ type: 'text' })
  certificate_description!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  certificate_url?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  certificate_number?: string;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  completion_percentage!: number;

  @Column({ type: 'integer', default: 0 })
  total_study_hours!: number;

  @Column({ type: 'timestamp with time zone' })
  completion_date!: Date;

  @Column({ type: 'timestamp with time zone', nullable: true })
  issued_date?: Date;

  @Column({ type: 'boolean', default: false })
  is_verified!: boolean;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: {
    final_grade?: string;
    skills_acquired?: string[];
    learning_outcomes?: string[];
    instructor_notes?: string;
  };

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
