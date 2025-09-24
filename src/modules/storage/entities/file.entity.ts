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

export type FileType = 'image' | 'video' | 'audio' | 'document' | 'slide' | 'certificate' | 'other';
export type FileStatus = 'uploading' | 'processing' | 'ready' | 'failed' | 'deleted';

@Entity('files')
export class File {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  user_id!: string;

  @Column({ type: 'varchar', length: 500 })
  file_name!: string;

  @Column({ type: 'varchar', length: 500 })
  original_name!: string;

  @Column({ type: 'varchar', length: 50 })
  file_type!: FileType;

  @Column({ type: 'varchar', length: 100 })
  mime_type!: string;

  @Column({ type: 'bigint' })
  file_size!: number;

  @Column({ type: 'varchar', length: 500 })
  file_url!: string;

  @Column({ type: 'varchar', length: 100 })
  bucket_name!: string;

  @Column({ type: 'varchar', length: 500 })
  object_key!: string;

  @Column({ type: 'varchar', length: 20, default: 'ready' })
  status!: FileStatus;

  @Column({ type: 'boolean', default: false })
  is_public!: boolean;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  @Column({ type: 'varchar', length: 500, nullable: true })
  thumbnail_url?: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  preview_url?: string;

  @Column({ type: 'timestamp with time zone', nullable: true })
  expires_at?: Date;

  @CreateDateColumn({ type: 'timestamp with time zone', default: () => 'now()' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone', default: () => 'now()' })
  updated_at!: Date;

  // Relations
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;
}
