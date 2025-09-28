import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { CoursesService } from './services/courses.service';
import { CreateCourseDto, UpdateCourseDto, CreateTopicDto, CreateSubtopicDto } from './dto';
import { CreateCourseReviewDto, UpdateCourseReviewDto, CreateReviewReplyDto, VoteReviewDto } from './dto/course-review.dto';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { Roles, CurrentUser, Public } from '../../common/decorators';
import { JwtPayload } from '../../config/jwt.config';

/**
 * Courses controller for managing course creation, topics, and enrollments
 */
@ApiTags('Courses')
@Controller('courses')
@UseGuards(JwtAuthGuard)
export class CoursesController {
  constructor(private readonly coursesService: CoursesService) {}

  @Post()
  @ApiOperation({ summary: 'Create new course (tutor only)' })
  @ApiResponse({ status: 201, description: 'Course created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid course data' })
  @ApiBearerAuth()
  @Roles('tutor')
  @HttpCode(HttpStatus.CREATED)
  async createCourse(
    @CurrentUser() user: JwtPayload,
    @Body() createCourseDto: CreateCourseDto,
  ) {
    return this.coursesService.createCourse(user.sub, createCourseDto);
  }

  @Get()
  @Public()
  @ApiOperation({ summary: 'Get list of courses' })
  @ApiResponse({ status: 200, description: 'Courses retrieved successfully' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by course status' })
  @ApiQuery({ name: 'level', required: false, description: 'Filter by course level' })
  @ApiQuery({ name: 'tutorId', required: false, description: 'Filter by tutor ID' })
  async getCourses(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('status') status?: string,
    @Query('level') level?: string,
    @Query('tutorId') tutorId?: string,
  ) {
    return this.coursesService.getCourses(page, limit, status, level, tutorId);
  }

  @Get(':id')
  @Public()
  @ApiOperation({ summary: 'Get course details' })
  @ApiResponse({ status: 200, description: 'Course details retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Course not found' })
  async getCourseById(@Param('id') courseId: string) {
    return this.coursesService.getCourseById(courseId);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update course (tutor only)' })
  @ApiResponse({ status: 200, description: 'Course updated successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - not course owner' })
  @ApiResponse({ status: 404, description: 'Course not found' })
  @ApiBearerAuth()
  @Roles('tutor')
  async updateCourse(
    @CurrentUser() user: JwtPayload,
    @Param('id') courseId: string,
    @Body() updateCourseDto: UpdateCourseDto,
  ) {
    return this.coursesService.updateCourse(courseId, user.sub, updateCourseDto);
  }

  @Patch(':id/price')
  @ApiOperation({ summary: 'Set course price in INR (tutor only)' })
  @ApiResponse({ status: 200, description: 'Course price updated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid price value' })
  @ApiResponse({ status: 403, description: 'Forbidden - not course owner' })
  @ApiResponse({ status: 404, description: 'Course not found' })
  @ApiBearerAuth()
  @Roles('tutor')
  async setCoursePrice(
    @CurrentUser() user: JwtPayload,
    @Param('id') courseId: string,
    @Body() priceDto: { priceInINR: number },
  ) {
    return this.coursesService.setCoursePrice(courseId, user.sub, priceDto.priceInINR);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete course (tutor only)' })
  @ApiResponse({ status: 200, description: 'Course deleted successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - not course owner' })
  @ApiResponse({ status: 404, description: 'Course not found' })
  @ApiBearerAuth()
  @Roles('tutor')
  async deleteCourse(
    @CurrentUser() user: JwtPayload,
    @Param('id') courseId: string,
  ) {
    await this.coursesService.deleteCourse(courseId, user.sub);
  }

  @Post(':id/sections')
  @ApiOperation({ summary: 'Create course section (tutor only)' })
  @ApiResponse({ status: 201, description: 'Topic created successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - not course owner' })
  @ApiResponse({ status: 404, description: 'Course not found' })
  @ApiBearerAuth()
  @Roles('tutor')
  @HttpCode(HttpStatus.CREATED)
  async createSection(
    @CurrentUser() user: JwtPayload,
    @Param('id') courseId: string,
    @Body() createTopicDto: CreateTopicDto,
  ) {
    return this.coursesService.createSection(courseId, user.sub, createTopicDto);
  }

  @Get(':id/sections')
  @Public()
  @ApiOperation({ summary: 'Get course sections' })
  @ApiResponse({ status: 200, description: 'Topics retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Course not found' })
  async getCourseSections(@Param('id') courseId: string) {
    return this.coursesService.getCourseSections(courseId);
  }

  @Post('sections/:sectionId/subtopics')
  @ApiOperation({ summary: 'Create course subtopic (tutor only)' })
  @ApiResponse({ status: 201, description: 'Subtopic created successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - not course owner' })
  @ApiResponse({ status: 404, description: 'Topic not found' })
  @ApiBearerAuth()
  @Roles('tutor')
  @HttpCode(HttpStatus.CREATED)
  async createSubtopic(
    @CurrentUser() user: JwtPayload,
    @Param('sectionId') sectionId: string,
    @Body() createSubtopicDto: CreateSubtopicDto,
  ) {
    return this.coursesService.createSubtopic(sectionId, user.sub, createSubtopicDto);
  }

  @Get('sections/:sectionId/subtopics')
  @Public()
  @ApiOperation({ summary: 'Get section subtopics' })
  @ApiResponse({ status: 200, description: 'Subtopics retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Topic not found' })
  async getSectionSubtopics(@Param('sectionId') sectionId: string) {
    return this.coursesService.getSectionSubtopics(sectionId);
  }

  @Post(':id/enroll')
  @ApiOperation({ summary: 'Enroll in course (student only)' })
  @ApiResponse({ status: 201, description: 'Enrolled successfully' })
  @ApiResponse({ status: 400, description: 'Already enrolled or course not available' })
  @ApiResponse({ status: 404, description: 'Course not found' })
  @ApiBearerAuth()
  @Roles('student')
  @HttpCode(HttpStatus.CREATED)
  async enrollInCourse(
    @CurrentUser() user: JwtPayload,
    @Param('id') courseId: string,
  ) {
    return this.coursesService.enrollInCourse(user.sub, courseId);
  }

  @Get('me/enrollments')
  @ApiOperation({ summary: 'Get my enrollments' })
  @ApiResponse({ status: 200, description: 'Enrollments retrieved successfully' })
  @ApiBearerAuth()
  @Roles('student')
  async getMyEnrollments(@CurrentUser() user: JwtPayload) {
    return this.coursesService.getStudentEnrollments(user.sub);
  }

  @Get('me/created')
  @ApiOperation({ summary: 'Get courses created by me (tutor only)' })
  @ApiResponse({ status: 200, description: 'Tutor courses retrieved successfully' })
  @ApiBearerAuth()
  @Roles('tutor')
  async getMyCourses(@CurrentUser() user: JwtPayload) {
    return this.coursesService.getTutorCourses(user.sub);
  }

  @Get('platform/all')
  @Public()
  @ApiOperation({ summary: 'Get all courses available on platform by different tutors' })
  @ApiResponse({ status: 200, description: 'Platform courses retrieved successfully' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page' })
  @ApiQuery({ name: 'category', required: false, description: 'Filter by category' })
  @ApiQuery({ name: 'priceRange', required: false, description: 'Filter by price range (e.g., 0-1000)' })
  @ApiQuery({ name: 'level', required: false, description: 'Filter by difficulty level' })
  @ApiQuery({ name: 'search', required: false, description: 'Search query' })
  async getAllPlatformCourses(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
    @Query('category') category?: string,
    @Query('priceRange') priceRange?: string,
    @Query('level') level?: string,
    @Query('search') search?: string,
  ) {
    return this.coursesService.getAllPlatformCourses({
      page,
      limit,
      level,
      search,
    });
  }

  @Get('student/:studentId/enrolled')
  @ApiOperation({ summary: 'Get courses enrolled by a specific student (admin only)' })
  @ApiResponse({ status: 200, description: 'Student courses retrieved successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - admin access required' })
  @ApiBearerAuth()
  @Roles('admin')
  async getStudentCourses(
    @Param('studentId') studentId: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    return this.coursesService.getStudentCourses(studentId, page, limit);
  }

  @Get(':id/enrollments')
  @ApiOperation({ summary: 'Get course enrollments (tutor only)' })
  @ApiResponse({ status: 200, description: 'Enrollments retrieved successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - not course owner' })
  @ApiResponse({ status: 404, description: 'Course not found' })
  @ApiBearerAuth()
  @Roles('tutor')
  async getCourseEnrollments(
    @CurrentUser() user: JwtPayload,
    @Param('id') courseId: string,
  ) {
    return this.coursesService.getCourseEnrollments(courseId, user.sub);
  }

  @Get(':courseId/videos/:subtopicId/stream')
  @ApiOperation({ summary: 'Stream course video (secure access)' })
  @ApiResponse({ status: 200, description: 'Video stream URL generated' })
  @ApiResponse({ status: 403, description: 'Access denied - not enrolled or not course owner' })
  @ApiResponse({ status: 404, description: 'Video not found' })
  @ApiBearerAuth()
  async streamVideo(
    @CurrentUser() user: JwtPayload,
    @Param('courseId') courseId: string,
    @Param('subtopicId') subtopicId: string,
  ) {
    return this.coursesService.generateSecureVideoStreamUrl(
      user.sub,
      courseId,
      subtopicId,
    );
  }

  @Get(':id/generation/progress')
  @ApiOperation({ summary: 'Get course generation progress' })
  @ApiResponse({ status: 200, description: 'Generation progress retrieved successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - not course owner' })
  @ApiResponse({ status: 404, description: 'Course not found' })
  @ApiBearerAuth()
  @Roles('tutor', 'admin')
  async getCourseGenerationProgress(
    @CurrentUser() user: JwtPayload,
    @Param('id') courseId: string,
  ) {
    return this.coursesService.getCourseGenerationProgress(courseId, user.sub);
  }

  @Get(':id/analytics')
  @ApiOperation({ summary: 'Get course analytics (tutor only)' })
  @ApiResponse({ status: 200, description: 'Course analytics retrieved successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - not course owner' })
  @ApiResponse({ status: 404, description: 'Course not found' })
  @ApiBearerAuth()
  @Roles('tutor', 'admin')
  async getCourseAnalytics(
    @CurrentUser() user: JwtPayload,
    @Param('id') courseId: string,
  ) {
    return this.coursesService.getCourseAnalytics(courseId, user.sub);
  }

  // Course Reviews Endpoints
  @Post('reviews')
  @UseGuards(RolesGuard)
  @Roles('student')
  @ApiOperation({ summary: 'Create course review (student only)' })
  @ApiResponse({ status: 201, description: 'Review created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid review data' })
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  async createCourseReview(
    @CurrentUser() user: JwtPayload,
    @Body() createReviewDto: CreateCourseReviewDto,
  ) {
    return this.coursesService.createCourseReview(user.sub, createReviewDto);
  }

  @Get('reviews')
  @Public()
  @ApiOperation({ summary: 'Get course reviews' })
  @ApiResponse({ status: 200, description: 'Reviews retrieved successfully' })
  @ApiQuery({ name: 'courseId', required: false, type: String, description: 'Filter by course ID' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page' })
  async getCourseReviews(
    @Query('courseId') courseId?: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    return this.coursesService.getCourseReviews(courseId!, page, limit);
  }

  @Put('reviews/:id')
  @UseGuards(RolesGuard)
  @Roles('student')
  @ApiOperation({ summary: 'Update course review (student only)' })
  @ApiResponse({ status: 200, description: 'Review updated successfully' })
  @ApiResponse({ status: 404, description: 'Review not found' })
  @ApiBearerAuth()
  async updateCourseReview(
    @CurrentUser() user: JwtPayload,
    @Param('id') reviewId: string,
    @Body() updateReviewDto: UpdateCourseReviewDto,
  ) {
    return this.coursesService.updateCourseReview(reviewId, user.sub, updateReviewDto);
  }

  @Delete('reviews/:id')
  @UseGuards(RolesGuard)
  @Roles('student')
  @ApiOperation({ summary: 'Delete course review (student only)' })
  @ApiResponse({ status: 200, description: 'Review deleted successfully' })
  @ApiResponse({ status: 404, description: 'Review not found' })
  @ApiBearerAuth()
  async deleteCourseReview(
    @CurrentUser() user: JwtPayload,
    @Param('id') reviewId: string,
  ) {
    return this.coursesService.deleteCourseReview(reviewId, user.sub);
  }

  @Post('reviews/:id/vote')
  @UseGuards(RolesGuard)
  @Roles('student')
  @ApiOperation({ summary: 'Vote on course review (student only)' })
  @ApiResponse({ status: 200, description: 'Vote recorded successfully' })
  @ApiResponse({ status: 404, description: 'Review not found' })
  @ApiBearerAuth()
  async voteReview(
    @CurrentUser() user: JwtPayload,
    @Param('id') reviewId: string,
    @Body() voteDto: VoteReviewDto,
  ) {
    return this.coursesService.voteReview(reviewId, user.sub, voteDto.is_helpful);
  }

  @Post('reviews/replies')
  @UseGuards(RolesGuard)
  @Roles('tutor', 'admin')
  @ApiOperation({ summary: 'Reply to course review (tutor/admin only)' })
  @ApiResponse({ status: 201, description: 'Reply created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid reply data' })
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  async createReviewReply(
    @CurrentUser() user: JwtPayload,
    @Body() createReplyDto: CreateReviewReplyDto,
  ) {
    return this.coursesService.createReviewReply(user.sub, createReplyDto);
  }

  // Phase 5: Additional Endpoints Implementation

  @Patch(':id/publish')
  @ApiOperation({ summary: 'Publish course with pricing (tutor only)' })
  @ApiResponse({ status: 200, description: 'Course published successfully' })
  @ApiResponse({ status: 400, description: 'Invalid pricing data' })
  @ApiResponse({ status: 403, description: 'Forbidden - not course owner' })
  @ApiResponse({ status: 404, description: 'Course not found' })
  @ApiBearerAuth()
  @Roles('tutor')
  async publishCourse(
    @CurrentUser() user: JwtPayload,
    @Param('id') courseId: string,
    @Body() publishDto: { priceInINR: number },
  ) {
    return this.coursesService.publishCourse(courseId, user.sub, publishDto.priceInINR);
  }

  @Get('tutors/:tutorId/courses')
  @Public()
  @ApiOperation({ summary: 'Get courses by specific tutor' })
  @ApiResponse({ status: 200, description: 'Tutor courses retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Tutor not found' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page' })
  async getTutorCourses(
    @Param('tutorId') tutorId: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    return this.coursesService.getTutorCourses(tutorId, page, limit);
  }

  @Get('search')
  @Public()
  @ApiOperation({ summary: 'Search courses with filters' })
  @ApiResponse({ status: 200, description: 'Courses retrieved successfully' })
  @ApiQuery({ name: 'q', required: false, description: 'Search query' })
  @ApiQuery({ name: 'category', required: false, description: 'Filter by category' })
  @ApiQuery({ name: 'level', required: false, description: 'Filter by level' })
  @ApiQuery({ name: 'priceMin', required: false, type: Number, description: 'Minimum price' })
  @ApiQuery({ name: 'priceMax', required: false, type: Number, description: 'Maximum price' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page' })
  async searchCourses(
    @Query('q') searchQuery?: string,
    @Query('category') category?: string,
    @Query('level') level?: string,
    @Query('priceMin') priceMin?: number,
    @Query('priceMax') priceMax?: number,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    return this.coursesService.searchCourses({
      searchQuery,
      category,
      level,
      priceMin,
      priceMax,
      page,
      limit,
    });
  }

  @Get(':id/details')
  @Public()
  @ApiOperation({ summary: 'Get course details with access control' })
  @ApiResponse({ status: 200, description: 'Course details retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Course not found' })
  async getCourseDetails(
    @CurrentUser() user: JwtPayload,
    @Param('id') courseId: string,
  ) {
    return this.coursesService.getCourseDetails(courseId, user?.sub);
  }

  @Get(':id/quizzes')
  @ApiOperation({ summary: 'Get course quizzes' })
  @ApiResponse({ status: 200, description: 'Quizzes retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Course not found' })
  @ApiBearerAuth()
  async getCourseQuizzes(
    @CurrentUser() user: JwtPayload,
    @Param('id') courseId: string,
  ) {
    return this.coursesService.getCourseQuizzes(courseId, user.sub);
  }

  @Get(':id/flashcards')
  @ApiOperation({ summary: 'Get course flashcards' })
  @ApiResponse({ status: 200, description: 'Flashcards retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Course not found' })
  @ApiBearerAuth()
  async getCourseFlashcards(
    @CurrentUser() user: JwtPayload,
    @Param('id') courseId: string,
  ) {
    return this.coursesService.getCourseFlashcards(courseId, user.sub);
  }

  @Post(':id/quizzes/:quizId/attempt')
  @ApiOperation({ summary: 'Submit quiz attempt (student only)' })
  @ApiResponse({ status: 201, description: 'Quiz attempt submitted successfully' })
  @ApiResponse({ status: 400, description: 'Invalid quiz attempt data' })
  @ApiResponse({ status: 403, description: 'Access denied - not enrolled' })
  @ApiBearerAuth()
  @Roles('student')
  @HttpCode(HttpStatus.CREATED)
  async submitQuizAttempt(
    @CurrentUser() user: JwtPayload,
    @Param('id') courseId: string,
    @Param('quizId') quizId: string,
    @Body() attemptDto: { answers: number[]; timeTaken: number },
  ) {
    return this.coursesService.submitQuizAttempt(courseId, quizId, user.sub, attemptDto);
  }

  @Get(':id/progress/:studentId')
  @ApiOperation({ summary: 'Get student progress in course' })
  @ApiResponse({ status: 200, description: 'Student progress retrieved successfully' })
  @ApiResponse({ status: 403, description: 'Access denied - not course owner or student' })
  @ApiResponse({ status: 404, description: 'Course or student not found' })
  @ApiBearerAuth()
  @Roles('tutor', 'student', 'admin')
  async getStudentProgress(
    @CurrentUser() user: JwtPayload,
    @Param('id') courseId: string,
    @Param('studentId') studentId: string,
  ) {
    return this.coursesService.getStudentProgress(courseId, studentId, user.sub);
  }

}
