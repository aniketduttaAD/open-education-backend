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
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AdminService } from './services/admin.service';
import { CreateSystemConfigDto, UpdateSystemConfigDto, BulkUserActionDto, BulkCourseActionDto } from './dto';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { Roles, CurrentUser } from '../../common/decorators';
import { JwtPayload } from '../../config/jwt.config';

/**
 * Admin controller for platform administration and management
 */
@ApiTags('Admin Management')
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@ApiBearerAuth()
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Get system statistics (admin only)' })
  @ApiResponse({ status: 200, description: 'System statistics retrieved successfully' })
  async getSystemStats() {
    const stats = await this.adminService.getSystemStats();
    return {
      success: true,
      data: stats,
      message: 'System statistics retrieved successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('analytics/users')
  @ApiOperation({ summary: 'Get user analytics (admin only)' })
  @ApiResponse({ status: 200, description: 'User analytics retrieved successfully' })
  async getUserAnalytics() {
    const analytics = await this.adminService.getUserAnalytics();
    return {
      success: true,
      data: analytics,
      message: 'User analytics retrieved successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('analytics/courses')
  @ApiOperation({ summary: 'Get course analytics (admin only)' })
  @ApiResponse({ status: 200, description: 'Course analytics retrieved successfully' })
  async getCourseAnalytics() {
    const analytics = await this.adminService.getCourseAnalytics();
    return {
      success: true,
      data: analytics,
      message: 'Course analytics retrieved successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('configs')
  @ApiOperation({ summary: 'Get system configurations (admin only)' })
  @ApiResponse({ status: 200, description: 'System configurations retrieved successfully' })
  @ApiQuery({ name: 'category', required: false, type: String, description: 'Filter by category' })
  async getSystemConfigs(@Query('category') category?: string) {
    const configs = await this.adminService.getSystemConfigs(category);
    return {
      success: true,
      data: configs,
      message: 'System configurations retrieved successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('configs/:key')
  @ApiOperation({ summary: 'Get specific system configuration (admin only)' })
  @ApiResponse({ status: 200, description: 'System configuration retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Configuration not found' })
  async getSystemConfig(@Param('key') key: string) {
    const config = await this.adminService.getSystemConfig(key);
    return {
      success: true,
      data: config,
      message: 'System configuration retrieved successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Post('configs')
  @ApiOperation({ summary: 'Create system configuration (admin only)' })
  @ApiResponse({ status: 201, description: 'System configuration created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid configuration data' })
  @HttpCode(HttpStatus.CREATED)
  async createSystemConfig(
    @CurrentUser() user: JwtPayload,
    @Body() createDto: CreateSystemConfigDto,
  ) {
    const config = await this.adminService.createSystemConfig(createDto, user.sub);
    return {
      success: true,
      data: config,
      message: 'System configuration created successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Put('configs/:id')
  @ApiOperation({ summary: 'Update system configuration (admin only)' })
  @ApiResponse({ status: 200, description: 'System configuration updated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid update data' })
  async updateSystemConfig(
    @CurrentUser() user: JwtPayload,
    @Param('id') configId: string,
    @Body() updateDto: UpdateSystemConfigDto,
  ) {
    const config = await this.adminService.updateSystemConfig(configId, updateDto, user.sub);
    return {
      success: true,
      data: config,
      message: 'System configuration updated successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Delete('configs/:id')
  @ApiOperation({ summary: 'Delete system configuration (admin only)' })
  @ApiResponse({ status: 200, description: 'System configuration deleted successfully' })
  @ApiResponse({ status: 400, description: 'Cannot delete required configuration' })
  async deleteSystemConfig(
    @CurrentUser() user: JwtPayload,
    @Param('id') configId: string,
  ) {
    await this.adminService.deleteSystemConfig(configId, user.sub);
    return {
      success: true,
      message: 'System configuration deleted successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Post('users/bulk-action')
  @ApiOperation({ summary: 'Perform bulk user actions (admin only)' })
  @ApiResponse({ status: 200, description: 'Bulk user action completed successfully' })
  @ApiResponse({ status: 400, description: 'Invalid bulk action data' })
  async performBulkUserAction(
    @CurrentUser() user: JwtPayload,
    @Body() bulkActionDto: BulkUserActionDto,
  ) {
    const result = await this.adminService.performBulkUserAction(bulkActionDto, user.sub);
    return {
      success: true,
      data: result,
      message: 'Bulk user action completed successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Post('courses/bulk-action')
  @ApiOperation({ summary: 'Perform bulk course actions (admin only)' })
  @ApiResponse({ status: 200, description: 'Bulk course action completed successfully' })
  @ApiResponse({ status: 400, description: 'Invalid bulk action data' })
  async performBulkCourseAction(
    @CurrentUser() user: JwtPayload,
    @Body() bulkActionDto: BulkCourseActionDto,
  ) {
    const result = await this.adminService.performBulkCourseAction(bulkActionDto, user.sub);
    return {
      success: true,
      data: result,
      message: 'Bulk course action completed successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('activities')
  @ApiOperation({ summary: 'Get admin activities (admin only)' })
  @ApiResponse({ status: 200, description: 'Admin activities retrieved successfully' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page' })
  @ApiQuery({ name: 'adminId', required: false, type: String, description: 'Filter by admin ID' })
  async getAdminActivities(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('adminId') adminId?: string,
  ) {
    const result = await this.adminService.getAdminActivities(page, limit, adminId);
    return {
      success: true,
      data: result.activities,
      pagination: {
        page,
        limit,
        total: result.total,
        pages: Math.ceil(result.total / limit),
      },
      message: 'Admin activities retrieved successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('tutors/pending-verification')
  @ApiOperation({ summary: 'Get tutors pending verification (admin only)' })
  @ApiResponse({ status: 200, description: 'Pending tutors retrieved successfully' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page' })
  async getPendingTutors(
    @CurrentUser() user: JwtPayload,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    const result = await this.adminService.getPendingTutors(page, limit);
    return {
      success: true,
      data: result.tutors,
      pagination: {
        page,
        limit,
        total: result.total,
        pages: Math.ceil(result.total / limit),
      },
      message: 'Pending tutors retrieved successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Put('tutors/:tutorId/verify')
  @ApiOperation({ summary: 'Verify or reject tutor (admin only)' })
  @ApiResponse({ status: 200, description: 'Tutor verification updated successfully' })
  @ApiResponse({ status: 404, description: 'Tutor not found' })
  async verifyTutor(
    @CurrentUser() user: JwtPayload,
    @Param('tutorId') tutorId: string,
    @Body() verificationData: { status: 'verified' | 'rejected'; reason?: string },
  ) {
    const result = await this.adminService.verifyTutor(tutorId, verificationData, user.sub);
    return {
      success: true,
      data: result,
      message: `Tutor ${verificationData.status} successfully`,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('tutors/:tutorId/documents')
  @ApiOperation({ summary: 'Get tutor verification documents (admin only)' })
  @ApiResponse({ status: 200, description: 'Tutor documents retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Tutor not found' })
  async getTutorDocuments(
    @CurrentUser() user: JwtPayload,
    @Param('tutorId') tutorId: string,
  ) {
    const documents = await this.adminService.getTutorDocuments(tutorId);
    return {
      success: true,
      data: documents,
      message: 'Tutor documents retrieved successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('tutors/:tutorId/documents/:documentId/url')
  @ApiOperation({ summary: 'Get download URL for a tutor verification document (admin only)' })
  @ApiResponse({ status: 200, description: 'URL generated successfully' })
  async getTutorDocumentUrl(
    @Param('tutorId') tutorId: string,
    @Param('documentId') documentId: string,
  ) {
    // Reuse storage controller/service route: expose a generic URL if needed later via adminService
    const url = await this.adminService.getTutorDocumentUrl(tutorId, documentId);
    return {
      success: true,
      data: { url },
      message: 'Tutor document URL generated successfully',
      timestamp: new Date().toISOString(),
    };
  }
}
