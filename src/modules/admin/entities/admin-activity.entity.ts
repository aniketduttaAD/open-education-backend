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

export type AdminAction = 
  | 'user_created' 
  | 'user_updated' 
  | 'user_deleted' 
  | 'user_suspended' 
  | 'user_activated'
  | 'course_created' 
  | 'course_updated' 
  | 'course_deleted' 
  | 'course_approved' 
  | 'course_rejected'
  | 'payment_processed' 
  | 'payment_refunded' 
  | 'system_config_updated' 
  | 'bulk_operation' 
  | 'data_export' 
  | 'data_import';

@Entity('admin_activities')
export class AdminActivity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  admin_id!: string;

  @Column({
    type: 'enum',
    enum: [
      'user_created', 'user_updated', 'user_deleted', 'user_suspended', 'user_activated',
      'course_created', 'course_updated', 'course_deleted', 'course_approved', 'course_rejected',
      'payment_processed', 'payment_refunded', 'system_config_updated', 'bulk_operation',
      'data_export', 'data_import'
    ],
  })
  action!: AdminAction;

  @Column({ type: 'varchar', length: 200 })
  description!: string;

  @Column({ type: 'uuid', nullable: true })
  target_user_id?: string;

  @Column({ type: 'uuid', nullable: true })
  target_course_id?: string;

  @Column({ type: 'uuid', nullable: true })
  target_payment_id?: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: {
    old_values?: any;
    new_values?: any;
    ip_address?: string;
    user_agent?: string;
    additional_info?: any;
  };

  @Column({ type: 'varchar', length: 50, nullable: true })
  ip_address?: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  user_agent?: string;

  @CreateDateColumn({ type: 'timestamp with time zone', default: () => 'now()' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone', default: () => 'now()' })
  updated_at!: Date;

  // Relations
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'admin_id' })
  admin?: User;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'target_user_id' })
  target_user?: User;
}
