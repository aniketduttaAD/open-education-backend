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

export enum CertificateStatus {
  PENDING = 'pending',
  GENERATED = 'generated',
  VERIFIED = 'verified',
  REVOKED = 'revoked',
}

/**
 * Certificate entity for course completion certificates
 * Stores certificate information with QR code verification
 */
@Entity('certificates')
export class Certificate {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  certificateNumber!: string;

  @Column({ type: 'enum', enum: CertificateStatus, default: CertificateStatus.PENDING })
  status!: CertificateStatus;

  @Column({ nullable: true })
  title!: string;

  @Column({ type: 'text', nullable: true })
  description!: string;

  @Column({ nullable: true })
  issuerName!: string;

  @Column({ nullable: true })
  issuerLogo?: string;

  @Column({ type: 'date', nullable: true })
  issueDate?: Date;

  @Column({ type: 'date', nullable: true })
  expiryDate?: Date;

  @Column({ nullable: true })
  qrCodeUrl?: string;

  @Column({ nullable: true })
  certificateUrl?: string;

  @Column({ type: 'json', nullable: true })
  metadata?: Record<string, any>;

  // Foreign Keys
  @Column({ name: 'user_id' })
  userId!: string;

  @Column({ name: 'course_id' })
  courseId!: string;

  // Relations
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @ManyToOne(() => Course, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'course_id' })
  course!: Course;

  // Timestamps
  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  // Business logic methods
  isGenerated(): boolean {
    return this.status === CertificateStatus.GENERATED;
  }

  isVerified(): boolean {
    return this.status === CertificateStatus.VERIFIED;
  }

  isRevoked(): boolean {
    return this.status === CertificateStatus.REVOKED;
  }

  isExpired(): boolean {
    return this.expiryDate ? new Date() > this.expiryDate : false;
  }

  getVerificationUrl(): string {
    return `/certificates/verify/${this.certificateNumber}`;
  }

  getQrCodeData(): string {
    return JSON.stringify({
      certificateNumber: this.certificateNumber,
      userId: this.userId,
      courseId: this.courseId,
      issueDate: this.issueDate,
      verificationUrl: this.getVerificationUrl(),
    });
  }
}
