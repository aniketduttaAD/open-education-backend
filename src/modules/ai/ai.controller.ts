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
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AIService } from './services/ai.service';
import { AIBuddyChatDto, GenerateRoadmapDto, GenerateTopicContentDto, GenerateQuizDto } from './dto';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { Roles, CurrentUser } from '../../common/decorators';
import { JwtPayload } from '../../config/jwt.config';

/**
 * AI controller for AI-powered features and content generation
 */
@ApiTags('AI')
@Controller('ai')
@UseGuards(JwtAuthGuard)
export class AIController {
  constructor(private readonly aiService: AIService) {}

  // Legacy roadmap route removed - use POST /api/roadmaps/generate instead

  @Post('topics/:topicId/content')
  @ApiOperation({ summary: 'Generate topic content (tutor only)' })
  @ApiResponse({ status: 201, description: 'Content generated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request data' })
  @ApiBearerAuth()
  @Roles('tutor')
  @HttpCode(HttpStatus.CREATED)
  async generateTopicContent(
    @CurrentUser() user: JwtPayload,
    @Param('topicId') topicId: string,
    @Body() generateContentDto: GenerateTopicContentDto,
  ) {
    return this.aiService.generateTopicContent(
      generateContentDto.title,
      generateContentDto.description,
      generateContentDto.course_context,
    );
  }

  @Post('quizzes/generate')
  @ApiOperation({ summary: 'Generate quiz questions (tutor only)' })
  @ApiResponse({ status: 201, description: 'Quiz generated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request data' })
  @ApiBearerAuth()
  @Roles('tutor')
  @HttpCode(HttpStatus.CREATED)
  async generateQuiz(
    @CurrentUser() user: JwtPayload,
    @Body() generateQuizDto: GenerateQuizDto,
  ) {
    return this.aiService.generateQuizQuestions(
      generateQuizDto.topic_title,
      generateQuizDto.content,
      generateQuizDto.difficulty || 'intermediate',
      generateQuizDto.question_count || 5,
    );
  }

  @Post('courses/:courseId/ai-buddy/chat')
  @ApiOperation({ summary: 'Chat with AI Buddy (student only)' })
  @ApiResponse({ status: 200, description: 'AI Buddy response generated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request or no tokens remaining' })
  @ApiBearerAuth()
  @Roles('student')
  async chatWithAIBuddy(
    @CurrentUser() user: JwtPayload,
    @Param('courseId') courseId: string,
    @Body() chatDto: AIBuddyChatDto,
  ) {
    return this.aiService.chatWithAIBuddy(
      user.sub,
      courseId,
      chatDto.message,
      undefined, // Let the service get course context
      chatDto.conversation_history || [],
    );
  }

  @Get('courses/:courseId/ai-buddy/history')
  @ApiOperation({ summary: 'Get AI Buddy conversation history' })
  @ApiResponse({ status: 200, description: 'Conversation history retrieved successfully' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page' })
  @ApiBearerAuth()
  @Roles('student')
  async getAIBuddyHistory(
    @CurrentUser() user: JwtPayload,
    @Param('courseId') courseId: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
  ) {
    return this.aiService.getAIBuddyUsageHistory(user.sub, courseId, page, limit);
  }

  @Get('courses/:courseId/tokens')
  @ApiOperation({ summary: 'Get token allocation for course' })
  @ApiResponse({ status: 200, description: 'Token allocation retrieved successfully' })
  @ApiBearerAuth()
  @Roles('student')
  async getTokenAllocation(
    @CurrentUser() user: JwtPayload,
    @Param('courseId') courseId: string,
  ) {
    // This would be implemented in the AI service
    return {
      courseId,
      tokensAllocated: 1000,
      tokensUsed: 0,
      tokensRemaining: 1000,
      resetDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    };
  }

  @Get('health')
  @ApiOperation({ summary: 'Get AI service health status' })
  @ApiResponse({ status: 200, description: 'Health status retrieved successfully' })
  async getHealthStatus() {
    return this.aiService.getHealthStatus();
  }

  @Post('courses/:courseId/topics/:topicId/video')
  @ApiOperation({ summary: 'Generate video for course topic' })
  @ApiResponse({ status: 201, description: 'Video generated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request data' })
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  async generateTopicVideo(
    @CurrentUser() user: JwtPayload,
    @Param('courseId') courseId: string,
    @Param('topicId') topicId: string,
    @Body() videoData: {
      title: string;
      content: string;
      learningObjectives: string[];
      keyPoints: string[];
    },
  ) {
    return this.aiService.generateTopicVideo(courseId, topicId, videoData);
  }

  @Post('courses/:courseId/video')
  @ApiOperation({ summary: 'Generate complete course video' })
  @ApiResponse({ status: 201, description: 'Course video generated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request data' })
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  async generateCourseVideo(
    @CurrentUser() user: JwtPayload,
    @Param('courseId') courseId: string,
    @Body() courseData: {
      title: string;
      description: string;
      topics: Array<{
        title: string;
        content: string;
        learningObjectives: string[];
        keyPoints: string[];
      }>;
    },
  ) {
    return this.aiService.generateCourseVideo(courseId, courseData);
  }
}
