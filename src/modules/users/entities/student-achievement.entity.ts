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

export type AchievementType = 'course_completion' | 'quiz_streak' | 'login_streak' | 'study_time' | 'first_course' | 'perfect_score';
export type AchievementRarity = 'common' | 'rare' | 'epic' | 'legendary';

@Entity('student_achievements')
export class StudentAchievement {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  user_id!: string;

  @Column({ type: 'varchar', length: 100 })
  achievement_type!: AchievementType;

  @Column({ type: 'varchar', length: 50 })
  rarity!: AchievementRarity;

  @Column({ type: 'varchar', length: 200 })
  title!: string;

  @Column({ type: 'text' })
  description!: string;

  @Column({ type: 'integer', default: 0 })
  points_earned!: number;

  @Column({ type: 'varchar', length: 500, nullable: true })
  icon_url?: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  @CreateDateColumn({ type: 'timestamp with time zone', default: () => 'now()' })
  earned_at!: Date;

  @CreateDateColumn({ type: 'timestamp with time zone', default: () => 'now()' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone', default: () => 'now()' })
  updated_at!: Date;

  // Relations
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;
}
