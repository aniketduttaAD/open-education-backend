import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AchievementType, AchievementRarity } from '../../users/entities';

@Entity('achievement_definitions')
export class AchievementDefinition {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 100, unique: true })
  name!: string;

  @Column({ type: 'varchar', length: 500 })
  description!: string;

  @Column({ type: 'varchar', length: 50 })
  type!: AchievementType;

  @Column({ type: 'varchar', length: 20 })
  rarity!: AchievementRarity;

  @Column({ type: 'int', default: 0 })
  points!: number;

  @Column({ type: 'varchar', length: 500, nullable: true })
  icon_url?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  badge_color?: string;

  @Column({ type: 'jsonb', nullable: true })
  criteria?: Record<string, any>;

  @Column({ type: 'boolean', default: true })
  is_active!: boolean;

  @CreateDateColumn({ type: 'timestamp with time zone', default: () => 'now()' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone', default: () => 'now()' })
  updated_at!: Date;
}
