import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export type ConfigCategory = 
  | 'general' 
  | 'payment' 
  | 'email' 
  | 'storage' 
  | 'security' 
  | 'features' 
  | 'analytics';

export type ConfigType = 'string' | 'number' | 'boolean' | 'json' | 'array';

@Entity('system_configs')
export class SystemConfig {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 100, unique: true })
  key!: string;

  @Column({ type: 'text' })
  value!: string;

  @Column({
    type: 'enum',
    enum: ['general', 'payment', 'email', 'storage', 'security', 'features', 'analytics'],
    default: 'general',
  })
  category!: ConfigCategory;

  @Column({
    type: 'enum',
    enum: ['string', 'number', 'boolean', 'json', 'array'],
    default: 'string',
  })
  type!: ConfigType;

  @Column({ type: 'varchar', length: 200 })
  description!: string;

  @Column({ type: 'boolean', default: true })
  is_public!: boolean;

  @Column({ type: 'boolean', default: false })
  is_required!: boolean;

  @Column({ type: 'text', nullable: true })
  validation_rules?: string;

  @Column({ type: 'text', nullable: true })
  default_value?: string;

  @CreateDateColumn({ type: 'timestamp with time zone', default: () => 'now()' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone', default: () => 'now()' })
  updated_at!: Date;
}
