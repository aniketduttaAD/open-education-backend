import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Notification } from './notification.entity';
import { DeliveryChannel } from './notification.entity';

export enum DeliveryStatus {
  PENDING = 'pending',
  SENT = 'sent',
  DELIVERED = 'delivered',
  FAILED = 'failed',
  BOUNCED = 'bounced',
  OPENED = 'opened',
  CLICKED = 'clicked',
}

/**
 * Notification delivery log entity
 * Tracks delivery status for each notification channel
 */
@Entity('notification_delivery_logs')
export class NotificationDeliveryLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'enum', enum: DeliveryChannel })
  channel!: DeliveryChannel;

  @Column({ type: 'enum', enum: DeliveryStatus, default: DeliveryStatus.PENDING })
  status!: DeliveryStatus;

  @Column({ nullable: true })
  externalId?: string; // External service ID (e.g., email ID, push notification ID)

  @Column({ type: 'text', nullable: true })
  errorMessage?: string;

  @Column({ type: 'json', nullable: true })
  metadata?: Record<string, any>;

  @Column({ type: 'timestamp', nullable: true })
  sentAt?: Date;

  @Column({ type: 'timestamp', nullable: true })
  deliveredAt?: Date;

  @Column({ type: 'timestamp', nullable: true })
  openedAt?: Date;

  @Column({ type: 'timestamp', nullable: true })
  clickedAt?: Date;

  // Foreign Keys
  @Column({ name: 'notification_id' })
  notificationId!: string;

  // Relations
  @ManyToOne(() => Notification, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'notification_id' })
  notification!: Notification;

  // Timestamps
  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  // Business logic methods
  isPending(): boolean {
    return this.status === DeliveryStatus.PENDING;
  }

  isSent(): boolean {
    return this.status === DeliveryStatus.SENT;
  }

  isDelivered(): boolean {
    return this.status === DeliveryStatus.DELIVERED;
  }

  isFailed(): boolean {
    return this.status === DeliveryStatus.FAILED;
  }

  isBounced(): boolean {
    return this.status === DeliveryStatus.BOUNCED;
  }

  isOpened(): boolean {
    return this.status === DeliveryStatus.OPENED;
  }

  isClicked(): boolean {
    return this.status === DeliveryStatus.CLICKED;
  }

  markAsSent(externalId?: string): void {
    this.status = DeliveryStatus.SENT;
    this.sentAt = new Date();
    if (externalId) {
      this.externalId = externalId;
    }
  }

  markAsDelivered(): void {
    this.status = DeliveryStatus.DELIVERED;
    this.deliveredAt = new Date();
  }

  markAsFailed(errorMessage: string): void {
    this.status = DeliveryStatus.FAILED;
    this.errorMessage = errorMessage;
  }

  markAsBounced(): void {
    this.status = DeliveryStatus.BOUNCED;
  }

  markAsOpened(): void {
    this.status = DeliveryStatus.OPENED;
    this.openedAt = new Date();
  }

  markAsClicked(): void {
    this.status = DeliveryStatus.CLICKED;
    this.clickedAt = new Date();
  }
}
