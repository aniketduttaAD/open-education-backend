import { Controller, Post, Get, Body, UseGuards, Logger, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AIBuddyService } from './services/aibuddy.service';
import { AIBuddyQueryDto } from './dto/query.dto';
import { JwtAuthGuard } from '../../common/guards';
import { CurrentUser, Public } from '../../common/decorators';
import { JwtPayload } from '../../config/jwt.config';

@ApiTags('AI Buddy')
@Controller('api/aibuddy')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AIBuddyController {
  private readonly logger = new Logger(AIBuddyController.name);

  constructor(private readonly aiBuddyService: AIBuddyService) {}

  @Post('query')
  @Public()
  @ApiOperation({ summary: 'Query AI Buddy with course context' })
  @ApiResponse({ status: 200, description: 'AI Buddy response generated' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'User not enrolled in course' })
  @ApiResponse({ status: 404, description: 'Course not found' })
  async query(
    @Body() dto: AIBuddyQueryDto,
  ) {
    this.logger.log(`Querying AI Buddy for course ${dto.courseId}`);
    return this.aiBuddyService.processQuery(dto, 'test-user-id');
  }

  @Get('usage')
  @ApiOperation({ summary: 'Get AI Buddy usage statistics' })
  @ApiQuery({ name: 'courseId', required: false, description: 'Filter by course ID' })
  @ApiResponse({ status: 200, description: 'Usage statistics retrieved' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getUsageStats(
    @CurrentUser() user: JwtPayload,
    @Query('courseId') courseId?: string,
  ) {
    this.logger.log(`User ${user.sub} retrieving AI Buddy usage stats`);
    return this.aiBuddyService.getUsageStats(user.sub, courseId);
  }
}
