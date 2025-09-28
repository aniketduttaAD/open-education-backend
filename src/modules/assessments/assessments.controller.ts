import { Controller, Post, Get, Param, Body, UseGuards, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { AssessmentsService } from './services/assessments.service';
import { GenerateAssessmentsDto } from './dto/generate-assessments.dto';
import { JwtAuthGuard } from '../../common/guards';
import { CurrentUser, Public } from '../../common/decorators';
import { JwtPayload } from '../../config/jwt.config';

@ApiTags('Assessments')
@Controller('api/assessments')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AssessmentsController {
  private readonly logger = new Logger(AssessmentsController.name);

  constructor(private readonly assessmentsService: AssessmentsService) {}

  @Post('generate')
  @Public()
  @ApiOperation({ summary: 'Generate quizzes and flashcards for a course' })
  @ApiResponse({ status: 201, description: 'Assessments generated successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Course not found' })
  async generateAssessments(
    @Body() dto: GenerateAssessmentsDto,
  ) {
    this.logger.log(`Generating assessments for course ${dto.id}`);
    return this.assessmentsService.generateAssessments(dto);
  }

  @Get(':courseId')
  @Public()
  @ApiOperation({ summary: 'Get assessments for a course' })
  @ApiParam({ name: 'courseId', description: 'Course ID' })
  @ApiResponse({ status: 200, description: 'Assessments retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Course not found' })
  async getAssessments(
    @Param('courseId') courseId: string,
  ) {
    this.logger.log(`Retrieving assessments for course ${courseId}`);
    return this.assessmentsService.getAssessments(courseId);
  }
}
