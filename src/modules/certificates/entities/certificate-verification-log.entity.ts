import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Certificate } from './certificate.entity';

export enum VerificationStatus {
  SUCCESS = 'success',
  FAILED = 'failed',
  EXPIRED = 'expired',
  REVOKED = 'revoked',
}

/**
 * Certificate verification log entity
 * Tracks all certificate verification attempts
 */
@Entity('certificate_verification_logs')
export class CertificateVerificationLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'enum', enum: VerificationStatus })
  status!: VerificationStatus;

  @Column({ nullable: true })
  ipAddress?: string;

  @Column({ nullable: true })
  userAgent?: string;

  @Column({ type: 'text', nullable: true })
  failureReason?: string;

  @Column({ type: 'json', nullable: true })
  metadata?: Record<string, any>;

  // Foreign Keys
  @Column({ name: 'certificate_id' })
  certificateId!: string;

  // Relations
  @ManyToOne(() => Certificate, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'certificate_id' })
  certificate!: Certificate;

  // Timestamps
  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  // Business logic methods
  isSuccessful(): boolean {
    return this.status === VerificationStatus.SUCCESS;
  }

  isFailed(): boolean {
    return this.status === VerificationStatus.FAILED;
  }

  isExpired(): boolean {
    return this.status === VerificationStatus.EXPIRED;
  }

  isRevoked(): boolean {
    return this.status === VerificationStatus.REVOKED;
  }
}
