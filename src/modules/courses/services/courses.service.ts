import { Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Course, CourseTopic, CourseSubtopic, CourseEnrollment, CourseReview, ReviewReply } from '../entities';
import { CreateCourseDto, UpdateCourseDto, CreateTopicDto, CreateSubtopicDto } from '../dto';

/**
 * Courses service for managing course creation, topics, and enrollments
 */
@Injectable()
export class CoursesService {
  private readonly logger = new Logger(CoursesService.name);

  constructor(
    @InjectRepository(Course)
    private courseRepository: Repository<Course>,
    @InjectRepository(CourseTopic)
    private courseTopicRepository: Repository<CourseTopic>,
    @InjectRepository(CourseSubtopic)
    private courseSubtopicRepository: Repository<CourseSubtopic>,
    @InjectRepository(CourseEnrollment)
    private courseEnrollmentRepository: Repository<CourseEnrollment>,
    @InjectRepository(CourseReview)
    private courseReviewRepository: Repository<CourseReview>,
    @InjectRepository(ReviewReply)
    private reviewReplyRepository: Repository<ReviewReply>,
  ) {}

  /**
   * Create a new course
   */
  async createCourse(tutorId: string, createCourseDto: CreateCourseDto): Promise<Course> {
    this.logger.log(`Creating course for tutor: ${tutorId}`);

    const course = this.courseRepository.create({
      tutor_id: tutorId,
      ...createCourseDto,
      status: 'draft',
    });

    const savedCourse = await this.courseRepository.save(course);
    this.logger.log(`Course created successfully: ${savedCourse.id}`);
    
    return savedCourse;
  }

  /**
   * Get all courses with filters
   */
  async getCourses(
    page: number = 1,
    limit: number = 10,
    status?: string,
    level?: string,
    tutorId?: string,
  ): Promise<{ courses: Course[]; total: number }> {
    this.logger.log(`Getting courses - page: ${page}, limit: ${limit}`);

    const queryBuilder = this.courseRepository.createQueryBuilder('course')
      .leftJoinAndSelect('course.tutor', 'tutor')
      .orderBy('course.created_at', 'DESC');

    if (status) {
      queryBuilder.andWhere('course.status = :status', { status });
    }

    if (level) {
      queryBuilder.andWhere('course.level = :level', { level });
    }

    if (tutorId) {
      queryBuilder.andWhere('course.tutor_id = :tutorId', { tutorId });
    }

    const [courses, total] = await queryBuilder
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { courses, total };
  }

  /**
   * Get course by ID
   */
  async getCourseById(courseId: string): Promise<Course> {
    this.logger.log(`Getting course: ${courseId}`);

    const course = await this.courseRepository.findOne({
      where: { id: courseId },
      relations: ['tutor'],
    });

    if (!course) {
      throw new NotFoundException('Course not found');
    }

    return course;
  }

  /**
   * Update course
   */
  async updateCourse(
    courseId: string,
    tutorId: string,
    updateCourseDto: UpdateCourseDto,
  ): Promise<Course> {
    this.logger.log(`Updating course: ${courseId}`);

    const course = await this.getCourseById(courseId);

    if (course.tutor_id !== tutorId) {
      throw new ForbiddenException('You can only update your own courses');
    }

    Object.assign(course, updateCourseDto);
    
    if (updateCourseDto.status === 'published' && !course.published_at) {
      course.published_at = new Date();
    }

    const updatedCourse = await this.courseRepository.save(course);
    this.logger.log(`Course updated successfully: ${courseId}`);
    
    return updatedCourse;
  }

  /**
   * Delete course
   */
  async deleteCourse(courseId: string, tutorId: string): Promise<void> {
    this.logger.log(`Deleting course: ${courseId}`);

    const course = await this.getCourseById(courseId);

    if (course.tutor_id !== tutorId) {
      throw new ForbiddenException('You can only delete your own courses');
    }

    await this.courseRepository.remove(course);
    this.logger.log(`Course deleted successfully: ${courseId}`);
  }

  /**
   * Create course topic
   */
  async createTopic(
    courseId: string,
    tutorId: string,
    createTopicDto: CreateTopicDto,
  ): Promise<CourseTopic> {
    this.logger.log(`Creating topic for course: ${courseId}`);

    const course = await this.getCourseById(courseId);

    if (course.tutor_id !== tutorId) {
      throw new ForbiddenException('You can only add topics to your own courses');
    }

    const topic = this.courseTopicRepository.create({
      course_id: courseId,
      ...createTopicDto,
    });

    const savedTopic = await this.courseTopicRepository.save(topic);
    
    // Update course topic count
    await this.updateCourseTopicCount(courseId);
    
    this.logger.log(`Topic created successfully: ${savedTopic.id}`);
    return savedTopic;
  }

  /**
   * Get course topics
   */
  async getCourseTopics(courseId: string): Promise<CourseTopic[]> {
    this.logger.log(`Getting topics for course: ${courseId}`);

    return this.courseTopicRepository.find({
      where: { course_id: courseId },
      order: { order_index: 'ASC' },
    });
  }

  /**
   * Create course subtopic
   */
  async createSubtopic(
    topicId: string,
    tutorId: string,
    createSubtopicDto: CreateSubtopicDto,
  ): Promise<CourseSubtopic> {
    this.logger.log(`Creating subtopic for topic: ${topicId}`);

    const topic = await this.courseTopicRepository.findOne({
      where: { id: topicId },
      relations: ['course'],
    });

    if (!topic) {
      throw new NotFoundException('Topic not found');
    }

    if (topic.course!.tutor_id !== tutorId) {
      throw new ForbiddenException('You can only add subtopics to your own courses');
    }

    const subtopic = this.courseSubtopicRepository.create({
      topic_id: topicId,
      ...createSubtopicDto,
    });

    const savedSubtopic = await this.courseSubtopicRepository.save(subtopic);
    
    // Update topic and course subtopic counts
    await this.updateTopicSubtopicCount(topicId);
    await this.updateCourseSubtopicCount(topic.course_id);
    
    this.logger.log(`Subtopic created successfully: ${savedSubtopic.id}`);
    return savedSubtopic;
  }

  /**
   * Get topic subtopics
   */
  async getTopicSubtopics(topicId: string): Promise<CourseSubtopic[]> {
    this.logger.log(`Getting subtopics for topic: ${topicId}`);

    return this.courseSubtopicRepository.find({
      where: { topic_id: topicId },
      order: { order_index: 'ASC' },
    });
  }

  /**
   * Enroll student in course
   */
  async enrollInCourse(studentId: string, courseId: string): Promise<CourseEnrollment> {
    this.logger.log(`Enrolling student ${studentId} in course: ${courseId}`);

    // Check if already enrolled
    const existingEnrollment = await this.courseEnrollmentRepository.findOne({
      where: { student_id: studentId, course_id: courseId },
    });

    if (existingEnrollment) {
      throw new BadRequestException('Student is already enrolled in this course');
    }

    const course = await this.getCourseById(courseId);
    
    if (course.status !== 'published') {
      throw new BadRequestException('Course is not available for enrollment');
    }

    const enrollment = this.courseEnrollmentRepository.create({
      student_id: studentId,
      course_id: courseId,
      status: 'active',
      started_at: new Date(),
    });

    const savedEnrollment = await this.courseEnrollmentRepository.save(enrollment);
    
    // Update course enrollment count
    await this.updateCourseEnrollmentCount(courseId);
    
    this.logger.log(`Student enrolled successfully: ${savedEnrollment.id}`);
    return savedEnrollment;
  }

  /**
   * Get student enrollments
   */
  async getStudentEnrollments(studentId: string): Promise<CourseEnrollment[]> {
    this.logger.log(`Getting enrollments for student: ${studentId}`);

    return this.courseEnrollmentRepository.find({
      where: { student_id: studentId },
      relations: ['course', 'course.tutor'],
      order: { created_at: 'DESC' },
    });
  }

  /**
   * Get course enrollments (for tutors)
   */
  async getCourseEnrollments(courseId: string, tutorId: string): Promise<CourseEnrollment[]> {
    this.logger.log(`Getting enrollments for course: ${courseId}`);

    const course = await this.getCourseById(courseId);

    if (course.tutor_id !== tutorId) {
      throw new ForbiddenException('You can only view enrollments for your own courses');
    }

    return this.courseEnrollmentRepository.find({
      where: { course_id: courseId },
      relations: ['student'],
      order: { created_at: 'DESC' },
    });
  }

  /**
   * Update course topic count
   */
  private async updateCourseTopicCount(courseId: string): Promise<void> {
    const count = await this.courseTopicRepository.count({
      where: { course_id: courseId },
    });

    await this.courseRepository.update(courseId, { enrollment_count: count });
  }

  /**
   * Update topic subtopic count
   */
  private async updateTopicSubtopicCount(topicId: string): Promise<void> {
    const count = await this.courseSubtopicRepository.count({
      where: { topic_id: topicId },
    });

    await this.courseTopicRepository.update(topicId, { total_subtopics: count });
  }

  /**
   * Update course subtopic count
   */
  private async updateCourseSubtopicCount(courseId: string): Promise<void> {
    const count = await this.courseSubtopicRepository
      .createQueryBuilder('subtopic')
      .leftJoin('subtopic.topic', 'topic')
      .where('topic.course_id = :courseId', { courseId })
      .getCount();

    await this.courseRepository.update(courseId, { enrollment_count: count });
  }

  /**
   * Update course enrollment count
   */
  private async updateCourseEnrollmentCount(courseId: string): Promise<void> {
    const count = await this.courseEnrollmentRepository.count({
      where: { course_id: courseId, status: 'active' },
    });

    await this.courseRepository.update(courseId, { enrollment_count: count });
  }

  // Course Review Methods
  async createCourseReview(studentId: string, createReviewDto: any): Promise<any> {
    this.logger.log(`Creating course review for student ${studentId}`);
    
    try {
      const review = this.courseReviewRepository.create({
        course_id: createReviewDto.courseId,
        student_id: studentId,
        rating: createReviewDto.rating,
        comment: createReviewDto.comment,
        is_verified_purchase: createReviewDto.isVerifiedPurchase || false,
        metadata: createReviewDto.metadata,
      });

      const savedReview = await this.courseReviewRepository.save(review);
      
      // Update course average rating
      await this.updateCourseRating(createReviewDto.courseId);
      
      return savedReview;
    } catch (error) {
      this.logger.error(`Failed to create course review:`, error);
      throw new BadRequestException('Failed to create course review');
    }
  }

  async getCourseReviews(courseId: string, page: number, limit: number): Promise<any> {
    this.logger.log(`Getting reviews for course ${courseId}`);
    
    try {
      const [reviews, total] = await this.courseReviewRepository.findAndCount({
        where: { course_id: courseId, is_public: true },
        relations: ['student'],
        order: { created_at: 'DESC' },
        skip: (page - 1) * limit,
        take: limit,
      });

      return { reviews, total, page, limit };
    } catch (error) {
      this.logger.error(`Failed to get course reviews:`, error);
      throw new BadRequestException('Failed to get course reviews');
    }
  }

  async updateCourseReview(reviewId: string, studentId: string, updateReviewDto: any): Promise<any> {
    this.logger.log(`Updating review ${reviewId} for student ${studentId}`);
    
    try {
      const review = await this.courseReviewRepository.findOne({
        where: { id: reviewId, student_id: studentId },
      });

      if (!review) {
        throw new BadRequestException('Review not found');
      }

      await this.courseReviewRepository.update(reviewId, {
        rating: updateReviewDto.rating,
        comment: updateReviewDto.comment,
        metadata: updateReviewDto.metadata,
      });

      // Update course average rating
      await this.updateCourseRating(review.course_id);
      
      return { message: 'Review updated successfully' };
    } catch (error) {
      this.logger.error(`Failed to update course review:`, error);
      throw new BadRequestException('Failed to update course review');
    }
  }

  async deleteCourseReview(reviewId: string, studentId: string): Promise<void> {
    this.logger.log(`Deleting review ${reviewId} for student ${studentId}`);
    
    try {
      const review = await this.courseReviewRepository.findOne({
        where: { id: reviewId, student_id: studentId },
      });

      if (!review) {
        throw new BadRequestException('Review not found');
      }

      await this.courseReviewRepository.delete(reviewId);
      
      // Update course average rating
      await this.updateCourseRating(review.course_id);
    } catch (error) {
      this.logger.error(`Failed to delete course review:`, error);
      throw new BadRequestException('Failed to delete course review');
    }
  }

  async voteReview(reviewId: string, studentId: string, isHelpful: boolean): Promise<any> {
    this.logger.log(`Voting on review ${reviewId} for student ${studentId}`);
    
    try {
      const review = await this.courseReviewRepository.findOne({
        where: { id: reviewId },
      });

      if (!review) {
        throw new BadRequestException('Review not found');
      }

      // Update vote counts
      const helpfulVotes = isHelpful ? review.helpful_votes + 1 : review.helpful_votes;
      const totalVotes = review.total_votes + 1;

      await this.courseReviewRepository.update(reviewId, {
        helpful_votes: helpfulVotes,
        total_votes: totalVotes,
      });

      return { message: 'Vote recorded successfully' };
    } catch (error) {
      this.logger.error(`Failed to vote on review:`, error);
      throw new BadRequestException('Failed to vote on review');
    }
  }

  async createReviewReply(studentId: string, createReplyDto: any): Promise<any> {
    this.logger.log(`Creating review reply for student ${studentId}`);
    
    try {
      const reply = this.reviewReplyRepository.create({
        review_id: createReplyDto.reviewId,
        user_id: studentId,
        content: createReplyDto.content,
      });

      const savedReply = await this.reviewReplyRepository.save(reply);
      return savedReply;
    } catch (error) {
      this.logger.error(`Failed to create review reply:`, error);
      throw new BadRequestException('Failed to create review reply');
    }
  }


  // Helper method to update course rating
  private async updateCourseRating(courseId: string): Promise<void> {
    try {
      const reviews = await this.courseReviewRepository.find({
        where: { course_id: courseId, is_public: true },
        select: ['rating'],
      });

      if (reviews.length > 0) {
        const averageRating = reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length;
        await this.courseRepository.update(courseId, {
          rating: Math.round(averageRating * 100) / 100,
          review_count: reviews.length,
        });
      }
    } catch (error) {
      this.logger.error(`Failed to update course rating:`, error);
    }
  }
}
