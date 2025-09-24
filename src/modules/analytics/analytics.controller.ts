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
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { AnalyticsService } from './services/analytics.service';
import { JwtAuthGuard } from '../../common/guards';
import { CurrentUser } from '../../common/decorators';
import { JwtPayload } from '../../config/jwt.config';

/**
 * Analytics controller for learning insights and performance tracking
 */
@ApiTags('Analytics')
@Controller('analytics')
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('student')
  @ApiOperation({ summary: 'Get student learning analytics' })
  @ApiResponse({ status: 200, description: 'Student analytics retrieved successfully' })
  @ApiQuery({ name: 'startDate', required: false, description: 'Start date for analytics (YYYY-MM-DD)' })
  @ApiQuery({ name: 'endDate', required: false, description: 'End date for analytics (YYYY-MM-DD)' })
  @ApiBearerAuth()
  async getStudentAnalytics(
    @CurrentUser() user: JwtPayload,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    
    return this.analyticsService.getStudentAnalytics(user.sub, start, end);
  }

  @Get('tutor')
  @ApiOperation({ summary: 'Get tutor analytics' })
  @ApiResponse({ status: 200, description: 'Tutor analytics retrieved successfully' })
  @ApiQuery({ name: 'startDate', required: false, description: 'Start date for analytics (YYYY-MM-DD)' })
  @ApiQuery({ name: 'endDate', required: false, description: 'End date for analytics (YYYY-MM-DD)' })
  @ApiBearerAuth()
  async getTutorAnalytics(
    @CurrentUser() user: JwtPayload,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    
    return this.analyticsService.getTutorAnalytics(user.sub, start, end);
  }

  @Get('course/:courseId')
  @ApiOperation({ summary: 'Get course analytics' })
  @ApiResponse({ status: 200, description: 'Course analytics retrieved successfully' })
  @ApiParam({ name: 'courseId', description: 'Course ID' })
  @ApiQuery({ name: 'startDate', required: false, description: 'Start date for analytics (YYYY-MM-DD)' })
  @ApiQuery({ name: 'endDate', required: false, description: 'End date for analytics (YYYY-MM-DD)' })
  @ApiBearerAuth()
  async getCourseAnalytics(
    @Param('courseId') courseId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    
    return this.analyticsService.getCourseAnalytics(courseId, start, end);
  }

  @Post('learning-activity')
  @ApiOperation({ summary: 'Record learning activity' })
  @ApiResponse({ status: 201, description: 'Learning activity recorded successfully' })
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  async recordLearningActivity(
    @CurrentUser() user: JwtPayload,
    @Body() activity: {
      courseId?: string;
      topicId?: string;
      timeSpentMinutes?: number;
      videosWatched?: number;
      quizzesCompleted?: number;
      quizScore?: number;
      aiBuddyInteractions?: number;
      tokensUsed?: number;
      progressPercentage?: number;
    },
  ) {
    return this.analyticsService.recordLearningActivity(user.sub, activity);
  }

  @Post('course-activity/:courseId')
  @ApiOperation({ summary: 'Record course activity' })
  @ApiResponse({ status: 201, description: 'Course activity recorded successfully' })
  @ApiParam({ name: 'courseId', description: 'Course ID' })
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  async recordCourseActivity(
    @Param('courseId') courseId: string,
    @Body() activity: {
      newEnrollments?: number;
      activeStudents?: number;
      completionRate?: number;
      rating?: number;
      revenue?: number;
      videoViews?: number;
      quizAttempts?: number;
      averageQuizScore?: number;
    },
  ) {
    return this.analyticsService.recordCourseActivity(courseId, activity);
  }
}
