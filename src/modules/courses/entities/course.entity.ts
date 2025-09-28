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
import { CourseSection } from './course-section.entity';


@Entity('courses')
export class Course {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  tutor_user_id!: string;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ type: 'integer', nullable: true })
  price_inr?: number;

  @CreateDateColumn({ type: 'timestamp with time zone', default: () => 'now()' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone', default: () => 'now()' })
  updated_at!: Date;

  // Relations
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tutor_user_id' })
  tutor?: User;

  @OneToMany(() => CourseSection, section => section.course, { cascade: true })
  sections?: CourseSection[];
}
