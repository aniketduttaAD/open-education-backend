import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Course } from '../../courses/entities/course.entity';
import { User } from '../../auth/entities/user.entity';

@Entity('ai_buddy_chats')
export class AIBuddyChats {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'course_id', type: 'uuid' })
  course_id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  user_id!: string;

  @Column({ name: 'session_id', type: 'varchar', length: 255 })
  session_id!: string;

  @Column({ type: 'text' })
  message!: string;

  @Column({ name: 'is_user_message', type: 'boolean' })
  is_user_message!: boolean;

  @Column({ type: 'text', nullable: true })
  response?: string;

  @Column({ name: 'embedding_results', type: 'jsonb', nullable: true })
  embedding_results?: any;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone', default: () => 'now()' })
  created_at!: Date;

  // Relations
  @ManyToOne(() => Course, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'course_id' })
  course?: Course;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;
}
