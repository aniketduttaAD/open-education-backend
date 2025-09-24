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

export type DocumentType = 'identity_proof' | 'address_proof' | 'educational_certificate' | 'bank_statement' | 'pan_card';
export type DocumentStatus = 'pending' | 'verified' | 'rejected';

@Entity('tutor_documents')
export class TutorDocument {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  user_id!: string;

  @Column({ type: 'varchar', length: 50 })
  document_type!: DocumentType;

  @Column({ type: 'varchar', length: 500 })
  file_url!: string;

  @Column({ type: 'varchar', length: 200 })
  file_name!: string;

  @Column({ type: 'varchar', length: 50 })
  file_type!: string;

  @Column({ type: 'bigint' })
  file_size!: number;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status!: DocumentStatus;

  @Column({ type: 'text', nullable: true })
  rejection_reason?: string;

  @Column({ type: 'uuid', nullable: true })
  verified_by?: string;

  @Column({ type: 'timestamp with time zone', nullable: true })
  verified_at?: Date;

  @CreateDateColumn({ type: 'timestamp with time zone', default: () => 'now()' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone', default: () => 'now()' })
  updated_at!: Date;

  // Relations
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;
}
