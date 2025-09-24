import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsController } from './notifications.controller';
// import { EmailTestController } from './controllers/email-test.controller';
import { NotificationsService } from './services/notifications.service';
import { EmailNotificationService } from './services/email-notification.service';
import { Notification, NotificationDeliveryLog } from './entities';

/**
 * Notifications module for managing user notifications
 * Handles email, in-app, and push notifications with delivery tracking
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Notification, NotificationDeliveryLog]),
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService, EmailNotificationService],
  exports: [NotificationsService, EmailNotificationService],
})
export class NotificationsModule {}
