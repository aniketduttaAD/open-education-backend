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

export enum NotificationType {
  COURSE_UPDATE = 'course_update',
  ACHIEVEMENT = 'achievement',
  PAYMENT = 'payment',
  LIVE_CLASS = 'live_class',
  SYSTEM = 'system',
  TUTOR_VERIFICATION = 'tutor_verification',
  COURSE_COMPLETION = 'course_completion',
  CERTIFICATE_READY = 'certificate_ready',
}

export enum NotificationStatus {
  UNREAD = 'unread',
  READ = 'read',
  ARCHIVED = 'archived',
}

export enum DeliveryChannel {
  IN_APP = 'in_app',
  EMAIL = 'email',
  PUSH = 'push',
  SMS = 'sms',
}

/**
 * Notification entity for user notifications
 * Stores all types of notifications with delivery tracking
 */
@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'enum', enum: NotificationType })
  type!: NotificationType;

  @Column({ type: 'enum', enum: NotificationStatus, default: NotificationStatus.UNREAD })
  status!: NotificationStatus;

  @Column()
  title!: string;

  @Column({ type: 'text' })
  message!: string;

  @Column({ type: 'json', nullable: true })
  data?: Record<string, any>;

  @Column({ type: 'json', nullable: true })
  metadata?: Record<string, any>;

  @Column({ type: 'boolean', default: false })
  isImportant!: boolean;

  @Column({ type: 'boolean', default: false })
  isActionRequired!: boolean;

  @Column({ nullable: true })
  actionUrl?: string;

  @Column({ nullable: true })
  actionText?: string;

  @Column({ type: 'timestamp', nullable: true })
  scheduledAt?: Date;

  @Column({ type: 'timestamp', nullable: true })
  readAt?: Date;

  @Column({ type: 'timestamp', nullable: true })
  archivedAt?: Date;

  // Foreign Keys
  @Column({ name: 'user_id' })
  userId!: string;

  @Column({ name: 'sender_id', nullable: true })
  senderId?: string;

  // Relations
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'sender_id' })
  sender?: User;

  // Timestamps
  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  // Business logic methods
  isRead(): boolean {
    return this.status === NotificationStatus.READ;
  }

  isUnread(): boolean {
    return this.status === NotificationStatus.UNREAD;
  }

  isArchived(): boolean {
    return this.status === NotificationStatus.ARCHIVED;
  }

  isScheduled(): boolean {
    return this.scheduledAt ? this.scheduledAt > new Date() : false;
  }

  canBeRead(): boolean {
    return this.status === NotificationStatus.UNREAD;
  }

  canBeArchived(): boolean {
    return this.status !== NotificationStatus.ARCHIVED;
  }

  markAsRead(): void {
    this.status = NotificationStatus.READ;
    this.readAt = new Date();
  }

  markAsArchived(): void {
    this.status = NotificationStatus.ARCHIVED;
    this.archivedAt = new Date();
  }

  getDeliveryChannels(): DeliveryChannel[] {
    // Default delivery channels based on notification type
    const channelMap = {
      [NotificationType.COURSE_UPDATE]: [DeliveryChannel.IN_APP, DeliveryChannel.EMAIL],
      [NotificationType.ACHIEVEMENT]: [DeliveryChannel.IN_APP, DeliveryChannel.PUSH],
      [NotificationType.PAYMENT]: [DeliveryChannel.IN_APP, DeliveryChannel.EMAIL],
      [NotificationType.LIVE_CLASS]: [DeliveryChannel.IN_APP, DeliveryChannel.PUSH, DeliveryChannel.EMAIL],
      [NotificationType.SYSTEM]: [DeliveryChannel.IN_APP],
      [NotificationType.TUTOR_VERIFICATION]: [DeliveryChannel.IN_APP, DeliveryChannel.EMAIL],
      [NotificationType.COURSE_COMPLETION]: [DeliveryChannel.IN_APP, DeliveryChannel.EMAIL],
      [NotificationType.CERTIFICATE_READY]: [DeliveryChannel.IN_APP, DeliveryChannel.EMAIL],
    };

    return channelMap[this.type] || [DeliveryChannel.IN_APP];
  }
}
