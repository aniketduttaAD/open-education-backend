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

@Entity('wishlists')
export class Wishlist {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  student_id!: string;

  @Column({ type: 'uuid' })
  course_id!: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  list_name?: string;

  @Column({ type: 'integer', default: 0 })
  priority!: number;

  @Column({ type: 'boolean', default: false })
  is_notification_enabled!: boolean;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  target_price?: number;

  @Column({ type: 'timestamp with time zone', nullable: true })
  target_date?: Date;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: {
    notes?: string;
    tags?: string[];
    reminder_frequency?: 'daily' | 'weekly' | 'monthly';
    price_alert_threshold?: number;
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
