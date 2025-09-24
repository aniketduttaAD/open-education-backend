// Temporarily disabled test-only email controller (dev utilities)
// import { Controller, Post, Body, UseGuards } from '@nestjs/common';
// import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
// import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
// import { RolesGuard } from '../../../common/guards/roles.guard';
// import { Roles } from '../../../common/decorators/roles.decorator';
// import { EmailNotificationService } from '../services/email-notification.service';
// import { Notification, NotificationType } from '../entities/notification.entity';
//
// @ApiTags('Email Test')
// @Controller('email-test')
// @UseGuards(JwtAuthGuard, RolesGuard)
// @Roles('admin')
// @ApiBearerAuth()
// export class EmailTestController { /* ...disabled... */ }
