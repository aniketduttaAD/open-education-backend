import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AdminService } from './services/admin.service';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { Roles, CurrentUser } from '../../common/decorators';
import { JwtPayload } from '../../config/jwt.config';

export class ApproveTutorDto {
  tutorId: string;
}

export class RejectTutorDto {
  tutorId: string;
  reason: string;
}

export class PendingVerificationQuery {
  page?: number = 1;
  limit?: number = 10;
}

/**
 * Admin controller for managing tutor verification and system administration
 */
@ApiTags('Admin')
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@ApiBearerAuth()
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Post('tutors/:tutorId/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve tutor verification' })
  @ApiResponse({ status: 200, description: 'Tutor approved successfully' })
  @ApiResponse({ status: 404, description: 'Tutor not found' })
  @ApiResponse({ status: 400, description: 'Tutor already verified or invalid status' })
  async approveTutor(
    @Param('tutorId') tutorId: string,
    @CurrentUser() admin: JwtPayload,
  ) {
    const result = await this.adminService.approveTutor(tutorId, admin.sub);
    return {
      success: true,
      data: result,
      message: 'Tutor approved successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Post('tutors/:tutorId/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject tutor verification' })
  @ApiResponse({ status: 200, description: 'Tutor rejected successfully' })
  @ApiResponse({ status: 404, description: 'Tutor not found' })
  @ApiResponse({ status: 400, description: 'Tutor already processed or invalid status' })
  async rejectTutor(
    @Param('tutorId') tutorId: string,
    @Body() rejectData: { reason: string },
    @CurrentUser() admin: JwtPayload,
  ) {
    const result = await this.adminService.rejectTutor(tutorId, rejectData.reason, admin.sub);
    return {
      success: true,
      data: result,
      message: 'Tutor rejected successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('tutors/pending-verification')
  @ApiOperation({ summary: 'Get tutors pending verification' })
  @ApiResponse({ status: 200, description: 'Pending verifications retrieved successfully' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page' })
  async getPendingVerifications(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    const result = await this.adminService.getPendingVerifications(page, limit);
    return {
      success: true,
      data: result,
      message: 'Pending verifications retrieved successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('tutors/verification-stats')
  @ApiOperation({ summary: 'Get tutor verification statistics' })
  @ApiResponse({ status: 200, description: 'Verification statistics retrieved successfully' })
  async getVerificationStats() {
    const stats = await this.adminService.getVerificationStats();
    return {
      success: true,
      data: stats,
      message: 'Verification statistics retrieved successfully',
      timestamp: new Date().toISOString(),
    };
  }
}
