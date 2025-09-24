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
import { QuizService } from './services/quiz.service';
import { CreateQuizDto, StartQuizAttemptDto, SubmitQuizAnswersDto, CreateFlashcardDto, ReviewFlashcardDto } from './dto';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { Roles, CurrentUser } from '../../common/decorators';
import { JwtPayload } from '../../config/jwt.config';

/**
 * Quiz controller for quiz and assessment management
 */
@ApiTags('Quiz & Assessment')
@Controller('quizzes')
@UseGuards(JwtAuthGuard)
export class QuizController {
  constructor(private readonly quizService: QuizService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles('tutor')
  @ApiOperation({ summary: 'Create a new quiz (tutor only)' })
  @ApiResponse({ status: 201, description: 'Quiz created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid quiz data' })
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  async createQuiz(
    @CurrentUser() user: JwtPayload,
    @Body() createQuizDto: CreateQuizDto,
  ) {
    const quiz = await this.quizService.createQuiz(createQuizDto, user.sub);
    return {
      success: true,
      data: quiz,
      message: 'Quiz created successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('courses/:courseId')
  @ApiOperation({ summary: 'Get quizzes for a course' })
  @ApiResponse({ status: 200, description: 'Quizzes retrieved successfully' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page' })
  @ApiBearerAuth()
  async getQuizzesByCourse(
    @Param('courseId') courseId: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    const result = await this.quizService.getQuizzesByCourse(courseId, page, limit);
    return {
      success: true,
      data: result.quizzes,
      pagination: {
        page,
        limit,
        total: result.total,
        pages: Math.ceil(result.total / limit),
      },
      message: 'Quizzes retrieved successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get quiz details' })
  @ApiResponse({ status: 200, description: 'Quiz details retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Quiz not found' })
  @ApiBearerAuth()
  async getQuiz(@Param('id') id: string) {
    const quiz = await this.quizService.getQuizById(id);
    return {
      success: true,
      data: quiz,
      message: 'Quiz details retrieved successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Post(':id/attempt')
  @UseGuards(RolesGuard)
  @Roles('student')
  @ApiOperation({ summary: 'Start a quiz attempt (student only)' })
  @ApiResponse({ status: 201, description: 'Quiz attempt started successfully' })
  @ApiResponse({ status: 400, description: 'Invalid attempt data' })
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  async startQuizAttempt(
    @CurrentUser() user: JwtPayload,
    @Param('id') quizId: string,
    @Body() startQuizDto: StartQuizAttemptDto,
  ) {
    const attempt = await this.quizService.startQuizAttempt(
      { ...startQuizDto, quiz_id: quizId },
      user.sub,
    );
    return {
      success: true,
      data: attempt,
      message: 'Quiz attempt started successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Put(':id/attempt/:attemptId')
  @UseGuards(RolesGuard)
  @Roles('student')
  @ApiOperation({ summary: 'Submit quiz answers (student only)' })
  @ApiResponse({ status: 200, description: 'Quiz answers submitted successfully' })
  @ApiResponse({ status: 400, description: 'Invalid answers data' })
  @ApiBearerAuth()
  async submitQuizAnswers(
    @CurrentUser() user: JwtPayload,
    @Param('id') quizId: string,
    @Param('attemptId') attemptId: string,
    @Body() submitDto: SubmitQuizAnswersDto,
  ) {
    const attempt = await this.quizService.submitQuizAnswers(
      { ...submitDto, attempt_id: attemptId },
      user.sub,
    );
    return {
      success: true,
      data: attempt,
      message: 'Quiz answers submitted successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Get(':id/attempt/:attemptId')
  @UseGuards(RolesGuard)
  @Roles('student')
  @ApiOperation({ summary: 'Get quiz attempt results (student only)' })
  @ApiResponse({ status: 200, description: 'Quiz attempt results retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Quiz attempt not found' })
  @ApiBearerAuth()
  async getQuizAttempt(
    @CurrentUser() user: JwtPayload,
    @Param('id') quizId: string,
    @Param('attemptId') attemptId: string,
  ) {
    const attempt = await this.quizService.getQuizAttempt(attemptId, user.sub);
    return {
      success: true,
      data: attempt,
      message: 'Quiz attempt results retrieved successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('student/attempts')
  @UseGuards(RolesGuard)
  @Roles('student')
  @ApiOperation({ summary: 'Get student quiz attempts' })
  @ApiResponse({ status: 200, description: 'Quiz attempts retrieved successfully' })
  @ApiQuery({ name: 'quizId', required: false, type: String, description: 'Filter by quiz ID' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page' })
  @ApiBearerAuth()
  async getStudentQuizAttempts(
    @CurrentUser() user: JwtPayload,
    @Query('quizId') quizId?: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    const result = await this.quizService.getStudentQuizAttempts(user.sub, quizId, page, limit);
    return {
      success: true,
      data: result.attempts,
      pagination: {
        page,
        limit,
        total: result.total,
        pages: Math.ceil(result.total / limit),
      },
      message: 'Quiz attempts retrieved successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Get(':id/analytics')
  @UseGuards(RolesGuard)
  @Roles('tutor', 'admin')
  @ApiOperation({ summary: 'Get quiz analytics (tutor/admin only)' })
  @ApiResponse({ status: 200, description: 'Quiz analytics retrieved successfully' })
  @ApiBearerAuth()
  async getQuizAnalytics(@Param('id') quizId: string) {
    const analytics = await this.quizService.getQuizAnalytics(quizId);
    return {
      success: true,
      data: analytics,
      message: 'Quiz analytics retrieved successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Post('flashcards')
  @UseGuards(RolesGuard)
  @Roles('tutor')
  @ApiOperation({ summary: 'Create a flashcard (tutor only)' })
  @ApiResponse({ status: 201, description: 'Flashcard created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid flashcard data' })
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  async createFlashcard(
    @CurrentUser() user: JwtPayload,
    @Body() createFlashcardDto: CreateFlashcardDto,
  ) {
    const flashcard = await this.quizService.createFlashcard(createFlashcardDto);
    return {
      success: true,
      data: flashcard,
      message: 'Flashcard created successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('flashcards/subtopics/:subtopicId')
  @ApiOperation({ summary: 'Get flashcards for a subtopic' })
  @ApiResponse({ status: 200, description: 'Flashcards retrieved successfully' })
  @ApiBearerAuth()
  async getFlashcardsBySubtopic(@Param('subtopicId') subtopicId: string) {
    const flashcards = await this.quizService.getFlashcardsBySubtopic(subtopicId);
    return {
      success: true,
      data: flashcards,
      message: 'Flashcards retrieved successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Put('flashcards/:id/review')
  @UseGuards(RolesGuard)
  @Roles('student')
  @ApiOperation({ summary: 'Review a flashcard (student only)' })
  @ApiResponse({ status: 200, description: 'Flashcard reviewed successfully' })
  @ApiResponse({ status: 400, description: 'Invalid review data' })
  @ApiBearerAuth()
  async reviewFlashcard(
    @CurrentUser() user: JwtPayload,
    @Param('id') flashcardId: string,
    @Body() reviewDto: ReviewFlashcardDto,
  ) {
    const flashcard = await this.quizService.reviewFlashcard(
      { ...reviewDto, flashcard_id: flashcardId },
      user.sub,
    );
    return {
      success: true,
      data: flashcard,
      message: 'Flashcard reviewed successfully',
      timestamp: new Date().toISOString(),
    };
  }
}
