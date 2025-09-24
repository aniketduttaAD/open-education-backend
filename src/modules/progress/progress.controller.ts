import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ProgressService } from './services/progress.service';
import { StartVideoProgressDto, UpdateVideoProgressDto, CompleteVideoProgressDto } from './dto';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { Roles, CurrentUser } from '../../common/decorators';
import { JwtPayload } from '../../config/jwt.config';

/**
 * Progress controller for video progress and course completion tracking
 */
@ApiTags('Progress Tracking')
@Controller('progress')
@UseGuards(JwtAuthGuard)
export class ProgressController {
  constructor(private readonly progressService: ProgressService) {}

  @Post('video/start')
  @UseGuards(RolesGuard)
  @Roles('student')
  @ApiOperation({ summary: 'Start video watching (student only)' })
  @ApiResponse({ status: 201, description: 'Video progress started successfully' })
  @ApiResponse({ status: 400, description: 'Invalid progress data' })
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  async startVideoProgress(
    @CurrentUser() user: JwtPayload,
    @Body() startDto: StartVideoProgressDto,
  ) {
    const progress = await this.progressService.startVideoProgress(startDto, user.sub);
    return {
      success: true,
      data: progress,
      message: 'Video progress started successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Put('video/update')
  @UseGuards(RolesGuard)
  @Roles('student')
  @ApiOperation({ summary: 'Update video progress (student only)' })
  @ApiResponse({ status: 200, description: 'Video progress updated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid progress data' })
  @ApiBearerAuth()
  async updateVideoProgress(
    @CurrentUser() user: JwtPayload,
    @Body() updateDto: UpdateVideoProgressDto & { progress_id: string },
  ) {
    const progress = await this.progressService.updateVideoProgress(
      updateDto.progress_id,
      updateDto,
      user.sub,
    );
    return {
      success: true,
      data: progress,
      message: 'Video progress updated successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Post('video/complete')
  @UseGuards(RolesGuard)
  @Roles('student')
  @ApiOperation({ summary: 'Mark video as completed (student only)' })
  @ApiResponse({ status: 200, description: 'Video marked as completed successfully' })
  @ApiResponse({ status: 400, description: 'Invalid completion data' })
  @ApiBearerAuth()
  async completeVideoProgress(
    @CurrentUser() user: JwtPayload,
    @Body() completeDto: CompleteVideoProgressDto & { progress_id: string },
  ) {
    const progress = await this.progressService.completeVideoProgress(
      completeDto.progress_id,
      completeDto,
      user.sub,
    );
    return {
      success: true,
      data: progress,
      message: 'Video marked as completed successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('video/:id')
  @UseGuards(RolesGuard)
  @Roles('student')
  @ApiOperation({ summary: 'Get video progress (student only)' })
  @ApiResponse({ status: 200, description: 'Video progress retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Video progress not found' })
  @ApiBearerAuth()
  async getVideoProgress(
    @CurrentUser() user: JwtPayload,
    @Param('id') progressId: string,
  ) {
    const progress = await this.progressService.getVideoProgress(progressId, user.sub);
    return {
      success: true,
      data: progress,
      message: 'Video progress retrieved successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('course/:id')
  @UseGuards(RolesGuard)
  @Roles('student')
  @ApiOperation({ summary: 'Get course progress (student only)' })
  @ApiResponse({ status: 200, description: 'Course progress retrieved successfully' })
  @ApiBearerAuth()
  async getCourseProgress(
    @CurrentUser() user: JwtPayload,
    @Param('id') courseId: string,
  ) {
    const progress = await this.progressService.getCourseProgress(courseId, user.sub);
    return {
      success: true,
      data: progress,
      message: 'Course progress retrieved successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('student/progress')
  @UseGuards(RolesGuard)
  @Roles('student')
  @ApiOperation({ summary: 'Get student progress history' })
  @ApiResponse({ status: 200, description: 'Student progress retrieved successfully' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page' })
  @ApiBearerAuth()
  async getStudentProgress(
    @CurrentUser() user: JwtPayload,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    const result = await this.progressService.getStudentProgress(user.sub, page, limit);
    return {
      success: true,
      data: result.progress,
      pagination: {
        page,
        limit,
        total: result.total,
        pages: Math.ceil(result.total / limit),
      },
      message: 'Student progress retrieved successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('analytics/course/:id')
  @UseGuards(RolesGuard)
  @Roles('tutor', 'admin')
  @ApiOperation({ summary: 'Get course progress analytics (tutor/admin only)' })
  @ApiResponse({ status: 200, description: 'Progress analytics retrieved successfully' })
  @ApiBearerAuth()
  async getProgressAnalytics(@Param('id') courseId: string) {
    const analytics = await this.progressService.getProgressAnalytics(courseId);
    return {
      success: true,
      data: analytics,
      message: 'Progress analytics retrieved successfully',
      timestamp: new Date().toISOString(),
    };
  }
}
