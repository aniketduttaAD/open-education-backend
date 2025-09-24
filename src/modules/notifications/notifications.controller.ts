import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { NotificationsService } from './services/notifications.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { NotificationStatus } from './entities/notification.entity';

/**
 * Notifications controller for managing user notifications
 * Handles notification creation, retrieval, and user preferences
 */
@ApiTags('Notifications')
@Controller('notifications')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Get user notifications' })
  @ApiResponse({ status: 200, description: 'Notifications retrieved successfully' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page' })
  @ApiQuery({ name: 'status', required: false, enum: NotificationStatus, description: 'Filter by status' })
  async getUserNotifications(
    @CurrentUser() user: JwtPayload,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
    @Query('status') status?: NotificationStatus,
  ) {
    const result = await this.notificationsService.getUserNotifications(
      user.id,
      page,
      limit,
      status,
    );

    return {
      success: true,
      data: result,
      message: 'Notifications retrieved successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Create a new notification (admin only)' })
  @ApiResponse({ status: 201, description: 'Notification created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid notification data' })
  async createNotification(
    @CurrentUser() user: JwtPayload,
    @Body() createDto: CreateNotificationDto,
  ) {
    const notification = await this.notificationsService.createNotification(createDto);
    return {
      success: true,
      data: notification,
      message: 'Notification created successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Post('bulk')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Create bulk notifications (admin only)' })
  @ApiResponse({ status: 201, description: 'Bulk notifications created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid notification data' })
  async createBulkNotification(
    @CurrentUser() user: JwtPayload,
    @Body() body: { userIds: string[]; notification: Omit<CreateNotificationDto, 'userId'> },
  ) {
    const notifications = await this.notificationsService.createBulkNotification(
      body.userIds,
      body.notification,
    );

    return {
      success: true,
      data: notifications,
      message: 'Bulk notifications created successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Put(':id/read')
  @ApiOperation({ summary: 'Mark notification as read' })
  @ApiResponse({ status: 200, description: 'Notification marked as read' })
  @ApiResponse({ status: 404, description: 'Notification not found' })
  async markAsRead(
    @CurrentUser() user: JwtPayload,
    @Param('id') notificationId: string,
  ) {
    const notification = await this.notificationsService.markAsRead(notificationId, user.id);
    return {
      success: true,
      data: notification,
      message: 'Notification marked as read',
      timestamp: new Date().toISOString(),
    };
  }

  @Put('read-all')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  @ApiResponse({ status: 200, description: 'All notifications marked as read' })
  async markAllAsRead(@CurrentUser() user: JwtPayload) {
    const count = await this.notificationsService.markAllAsRead(user.id);
    return {
      success: true,
      data: { count },
      message: 'All notifications marked as read',
      timestamp: new Date().toISOString(),
    };
  }

  @Put(':id/archive')
  @ApiOperation({ summary: 'Archive notification' })
  @ApiResponse({ status: 200, description: 'Notification archived' })
  @ApiResponse({ status: 404, description: 'Notification not found' })
  async archiveNotification(
    @CurrentUser() user: JwtPayload,
    @Param('id') notificationId: string,
  ) {
    const notification = await this.notificationsService.archiveNotification(notificationId, user.id);
    return {
      success: true,
      data: notification,
      message: 'Notification archived',
      timestamp: new Date().toISOString(),
    };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete notification' })
  @ApiResponse({ status: 200, description: 'Notification deleted' })
  @ApiResponse({ status: 404, description: 'Notification not found' })
  async deleteNotification(
    @CurrentUser() user: JwtPayload,
    @Param('id') notificationId: string,
  ) {
    await this.notificationsService.deleteNotification(notificationId, user.id);
    return {
      success: true,
      message: 'Notification deleted',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get notification statistics' })
  @ApiResponse({ status: 200, description: 'Statistics retrieved successfully' })
  async getNotificationStats(@CurrentUser() user: JwtPayload) {
    const stats = await this.notificationsService.getNotificationStats(user.id);
    return {
      success: true,
      data: stats,
      message: 'Statistics retrieved successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('stats/admin')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Get platform notification statistics (admin only)' })
  @ApiResponse({ status: 200, description: 'Platform statistics retrieved successfully' })
  async getPlatformStats(@CurrentUser() user: JwtPayload) {
    const stats = await this.notificationsService.getNotificationStats();
    return {
      success: true,
      data: stats,
      message: 'Platform statistics retrieved successfully',
      timestamp: new Date().toISOString(),
    };
  }
}
