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

  @Post(':id/topics')
  @ApiOperation({ summary: 'Create course topic (tutor only)' })
  @ApiResponse({ status: 201, description: 'Topic created successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - not course owner' })
  @ApiResponse({ status: 404, description: 'Course not found' })
  @ApiBearerAuth()
  @Roles('tutor')
  @HttpCode(HttpStatus.CREATED)
  async createTopic(
    @CurrentUser() user: JwtPayload,
    @Param('id') courseId: string,
    @Body() createTopicDto: CreateTopicDto,
  ) {
    return this.coursesService.createTopic(courseId, user.sub, createTopicDto);
  }

  @Get(':id/topics')
  @Public()
  @ApiOperation({ summary: 'Get course topics' })
  @ApiResponse({ status: 200, description: 'Topics retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Course not found' })
  async getCourseTopics(@Param('id') courseId: string) {
    return this.coursesService.getCourseTopics(courseId);
  }

  @Post('topics/:topicId/subtopics')
  @ApiOperation({ summary: 'Create course subtopic (tutor only)' })
  @ApiResponse({ status: 201, description: 'Subtopic created successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - not course owner' })
  @ApiResponse({ status: 404, description: 'Topic not found' })
  @ApiBearerAuth()
  @Roles('tutor')
  @HttpCode(HttpStatus.CREATED)
  async createSubtopic(
    @CurrentUser() user: JwtPayload,
    @Param('topicId') topicId: string,
    @Body() createSubtopicDto: CreateSubtopicDto,
  ) {
    return this.coursesService.createSubtopic(topicId, user.sub, createSubtopicDto);
  }

  @Get('topics/:topicId/subtopics')
  @Public()
  @ApiOperation({ summary: 'Get topic subtopics' })
  @ApiResponse({ status: 200, description: 'Subtopics retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Topic not found' })
  async getTopicSubtopics(@Param('topicId') topicId: string) {
    return this.coursesService.getTopicSubtopics(topicId);
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

}
