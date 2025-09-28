import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { CurrentUser } from '../../common/decorators';
import { JwtPayload } from '../../config/jwt.config';
import { AIBuddyService } from './services/ai-buddy.service';

@ApiTags('AI Buddy')
@Controller('api/ai-buddy')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AIBuddyController {
  private readonly logger = new Logger(AIBuddyController.name);

  constructor(private readonly aiBuddyService: AIBuddyService) {}

  @Post(':courseId/chat')
  @ApiOperation({ summary: 'Chat with AI Buddy for a specific course' })
  @ApiParam({ name: 'courseId', description: 'Course ID' })
  @ApiResponse({ status: 200, description: 'AI response generated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  @ApiResponse({ status: 403, description: 'Access denied - not enrolled in course' })
  @ApiResponse({ status: 404, description: 'Course not found' })
  @ApiBearerAuth()
  async chat(
    @CurrentUser() user: JwtPayload,
    @Param('courseId') courseId: string,
    @Body() body: { message: string; sessionId?: string },
  ) {
    this.logger.log(
      `AI Buddy chat request - User: ${user.sub}, Course: ${courseId}, Message length: ${body.message?.length}`,
    );

    // Check if user has access to the course
    const hasAccess = await this.aiBuddyService.checkCourseAccess(user.sub, courseId);
    if (!hasAccess) {
      throw new Error('Access denied. You must be enrolled in this course to use AI Buddy.');
    }

    return this.aiBuddyService.chatWithAIBuddy(
      user.sub,
      courseId,
      body.message,
      body.sessionId,
    );
  }

  @Get(':courseId/chat/history')
  @ApiOperation({ summary: 'Get chat history for a session' })
  @ApiParam({ name: 'courseId', description: 'Course ID' })
  @ApiQuery({ name: 'sessionId', description: 'Chat session ID' })
  @ApiQuery({ name: 'limit', description: 'Number of messages to return', required: false })
  @ApiResponse({ status: 200, description: 'Chat history retrieved successfully' })
  @ApiResponse({ status: 403, description: 'Access denied - not enrolled in course' })
  @ApiBearerAuth()
  async getChatHistory(
    @CurrentUser() user: JwtPayload,
    @Param('courseId') courseId: string,
    @Query('sessionId') sessionId: string,
    @Query('limit') limit?: number,
  ) {
    this.logger.log(
      `Chat history request - User: ${user.sub}, Course: ${courseId}, Session: ${sessionId}`,
    );

    // Check if user has access to the course
    const hasAccess = await this.aiBuddyService.checkCourseAccess(user.sub, courseId);
    if (!hasAccess) {
      throw new Error('Access denied. You must be enrolled in this course.');
    }

    return this.aiBuddyService.getChatHistory(
      courseId,
      user.sub,
      sessionId,
      limit ? parseInt(limit.toString()) : 50,
    );
  }

  @Get(':courseId/chat/sessions')
  @ApiOperation({ summary: 'Get recent chat sessions for a course' })
  @ApiParam({ name: 'courseId', description: 'Course ID' })
  @ApiQuery({ name: 'limit', description: 'Number of sessions to return', required: false })
  @ApiResponse({ status: 200, description: 'Chat sessions retrieved successfully' })
  @ApiResponse({ status: 403, description: 'Access denied - not enrolled in course' })
  @ApiBearerAuth()
  async getRecentSessions(
    @CurrentUser() user: JwtPayload,
    @Param('courseId') courseId: string,
    @Query('limit') limit?: number,
  ) {
    this.logger.log(`Recent sessions request - User: ${user.sub}, Course: ${courseId}`);

    // Check if user has access to the course
    const hasAccess = await this.aiBuddyService.checkCourseAccess(user.sub, courseId);
    if (!hasAccess) {
      throw new Error('Access denied. You must be enrolled in this course.');
    }

    return this.aiBuddyService.getRecentSessions(
      courseId,
      user.sub,
      limit ? parseInt(limit.toString()) : 10,
    );
  }
}