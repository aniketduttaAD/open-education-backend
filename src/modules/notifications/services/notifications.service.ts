import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification, NotificationStatus, NotificationType } from '../entities/notification.entity';
import { NotificationDeliveryLog, DeliveryStatus } from '../entities/notification-delivery-log.entity';
import { DeliveryChannel } from '../entities/notification.entity';
import { CreateNotificationDto } from '../dto/create-notification.dto';
import { EmailNotificationService } from './email-notification.service';

/**
 * Notifications service for managing all notification operations
 * Handles notification creation, delivery, and user preferences
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
    @InjectRepository(NotificationDeliveryLog)
    private readonly deliveryLogRepository: Repository<NotificationDeliveryLog>,
    private readonly emailNotificationService: EmailNotificationService,
  ) {}

  /**
   * Create a new notification
   */
  async createNotification(createDto: CreateNotificationDto): Promise<Notification> {
    const notification = this.notificationRepository.create({
      ...createDto,
      scheduledAt: createDto.scheduledAt ? new Date(createDto.scheduledAt) : undefined,
    });

    const savedNotification = await this.notificationRepository.save(notification);
    this.logger.log(`Notification created: ${savedNotification.id}`);

    // Schedule delivery if not scheduled for later
    if (!savedNotification.isScheduled()) {
      await this.scheduleDelivery(savedNotification);
    }

    return savedNotification;
  }

  /**
   * Create notification for multiple users
   */
  async createBulkNotification(
    userIds: string[],
    createDto: Omit<CreateNotificationDto, 'userId'>,
  ): Promise<Notification[]> {
    const notifications = userIds.map(userId => 
      this.notificationRepository.create({
        ...createDto,
        userId,
        scheduledAt: createDto.scheduledAt ? new Date(createDto.scheduledAt) : undefined,
      })
    );

    const savedNotifications = await this.notificationRepository.save(notifications);
    this.logger.log(`Bulk notifications created: ${savedNotifications.length}`);

    // Schedule delivery for all notifications
    for (const notification of savedNotifications) {
      if (!notification.isScheduled()) {
        await this.scheduleDelivery(notification);
      }
    }

    return savedNotifications;
  }

  /**
   * Get user notifications
   */
  async getUserNotifications(
    userId: string,
    page: number = 1,
    limit: number = 20,
    status?: NotificationStatus,
  ): Promise<{
    notifications: Notification[];
    total: number;
    unreadCount: number;
  }> {
    const query = this.notificationRepository
      .createQueryBuilder('notification')
      .leftJoinAndSelect('notification.sender', 'sender')
      .where('notification.userId = :userId', { userId })
      .orderBy('notification.createdAt', 'DESC');

    if (status) {
      query.andWhere('notification.status = :status', { status });
    }

    const [notifications, total, unreadCount] = await Promise.all([
      query
        .skip((page - 1) * limit)
        .take(limit)
        .getMany(),
      query.getCount(),
      this.notificationRepository.count({
        where: { userId, status: NotificationStatus.UNREAD },
      }),
    ]);

    return { notifications, total, unreadCount };
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId: string, userId: string): Promise<Notification> {
    const notification = await this.notificationRepository.findOne({
      where: { id: notificationId, userId },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    if (notification.canBeRead()) {
      notification.markAsRead();
      await this.notificationRepository.save(notification);
      this.logger.log(`Notification marked as read: ${notificationId}`);
    }

    return notification;
  }

  /**
   * Mark all notifications as read for user
   */
  async markAllAsRead(userId: string): Promise<number> {
    const result = await this.notificationRepository.update(
      { userId, status: NotificationStatus.UNREAD },
      { status: NotificationStatus.READ, readAt: new Date() }
    );

    this.logger.log(`Marked ${result.affected} notifications as read for user ${userId}`);
    return result.affected || 0;
  }

  /**
   * Archive notification
   */
  async archiveNotification(notificationId: string, userId: string): Promise<Notification> {
    const notification = await this.notificationRepository.findOne({
      where: { id: notificationId, userId },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    if (notification.canBeArchived()) {
      notification.markAsArchived();
      await this.notificationRepository.save(notification);
      this.logger.log(`Notification archived: ${notificationId}`);
    }

    return notification;
  }

  /**
   * Delete notification
   */
  async deleteNotification(notificationId: string, userId: string): Promise<void> {
    const result = await this.notificationRepository.delete({
      id: notificationId,
      userId,
    });

    if (result.affected === 0) {
      throw new NotFoundException('Notification not found');
    }

    this.logger.log(`Notification deleted: ${notificationId}`);
  }

  /**
   * Get notification statistics
   */
  async getNotificationStats(userId?: string): Promise<{
    total: number;
    unread: number;
    byType: Record<NotificationType, number>;
    deliveryStats: Record<DeliveryChannel, { sent: number; delivered: number; failed: number }>;
  }> {
    const baseQuery = this.notificationRepository.createQueryBuilder('notification');
    
    if (userId) {
      baseQuery.where('notification.userId = :userId', { userId });
    }

    const [total, unread, byType, deliveryStats] = await Promise.all([
      baseQuery.getCount(),
      baseQuery.clone().andWhere('notification.status = :status', { status: NotificationStatus.UNREAD }).getCount(),
      this.getNotificationsByType(userId),
      this.getDeliveryStats(userId),
    ]);

    return { total, unread, byType, deliveryStats };
  }

  /**
   * Schedule notification delivery
   */
  private async scheduleDelivery(notification: Notification): Promise<void> {
    const channels = notification.getDeliveryChannels();

    for (const channel of channels) {
      const deliveryLog = this.deliveryLogRepository.create({
        notificationId: notification.id,
        channel,
        status: DeliveryStatus.PENDING,
      });

      await this.deliveryLogRepository.save(deliveryLog);

      // Send notification based on channel
      await this.sendNotificationByChannel(notification, deliveryLog);
    }
  }

  /**
   * Send notification by specific channel
   */
  private async sendNotificationByChannel(
    notification: Notification,
    deliveryLog: NotificationDeliveryLog,
  ): Promise<void> {
    try {
      switch (deliveryLog.channel) {
        case DeliveryChannel.EMAIL:
          await this.emailNotificationService.sendEmailNotification(notification, deliveryLog);
          break;
        case DeliveryChannel.IN_APP:
          // In-app notifications are handled by WebSocket
          deliveryLog.markAsDelivered();
          break;
        case DeliveryChannel.PUSH:
          // Push notifications would be implemented here
          deliveryLog.markAsDelivered();
          break;
        case DeliveryChannel.SMS:
          // SMS notifications would be implemented here
          deliveryLog.markAsDelivered();
          break;
      }

      await this.deliveryLogRepository.save(deliveryLog);
    } catch (error) {
      this.logger.error(`Failed to send notification via ${deliveryLog.channel}`, error);
      deliveryLog.markAsFailed(error instanceof Error ? error.message : 'Unknown error');
      await this.deliveryLogRepository.save(deliveryLog);
    }
  }

  /**
   * Get notifications by type
   */
  private async getNotificationsByType(userId?: string): Promise<Record<NotificationType, number>> {
    const query = this.notificationRepository
      .createQueryBuilder('notification')
      .select('notification.type', 'type')
      .addSelect('COUNT(*)', 'count')
      .groupBy('notification.type');

    if (userId) {
      query.where('notification.userId = :userId', { userId });
    }

    const results = await query.getRawMany();
    
    const byType = {} as Record<NotificationType, number>;
    Object.values(NotificationType).forEach(type => {
      byType[type] = 0;
    });

    results.forEach(result => {
      byType[result.type as NotificationType] = parseInt(result.count);
    });

    return byType;
  }

  /**
   * Get delivery statistics
   */
  private async getDeliveryStats(userId?: string): Promise<Record<DeliveryChannel, { sent: number; delivered: number; failed: number }>> {
    const query = this.deliveryLogRepository
      .createQueryBuilder('log')
      .leftJoin('log.notification', 'notification')
      .select('log.channel', 'channel')
      .addSelect('log.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('log.channel, log.status');

    if (userId) {
      query.where('notification.userId = :userId', { userId });
    }

    const results = await query.getRawMany();
    
    const stats = {} as Record<DeliveryChannel, { sent: number; delivered: number; failed: number }>;
    Object.values(DeliveryChannel).forEach(channel => {
      stats[channel as DeliveryChannel] = { sent: 0, delivered: 0, failed: 0 };
    });

    results.forEach(result => {
      const channel = result.channel as DeliveryChannel;
      const count = parseInt(result.count);
      
      switch (result.status) {
        case DeliveryStatus.SENT:
        case DeliveryStatus.DELIVERED:
        case DeliveryStatus.OPENED:
        case DeliveryStatus.CLICKED:
          stats[channel].sent += count;
          if (result.status === DeliveryStatus.DELIVERED || result.status === DeliveryStatus.OPENED || result.status === DeliveryStatus.CLICKED) {
            stats[channel].delivered += count;
          }
          break;
        case DeliveryStatus.FAILED:
        case DeliveryStatus.BOUNCED:
          stats[channel].failed += count;
          break;
      }
    });

    return stats;
  }

  /**
   * Process scheduled notifications
   */
  async processScheduledNotifications(): Promise<number> {
    const scheduledNotifications = await this.notificationRepository.find({
      where: {
        scheduledAt: new Date(),
        status: NotificationStatus.UNREAD,
      },
    });

    let processed = 0;
    for (const notification of scheduledNotifications) {
      await this.scheduleDelivery(notification);
      processed++;
    }

    this.logger.log(`Processed ${processed} scheduled notifications`);
    return processed;
  }
}
