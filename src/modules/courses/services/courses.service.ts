import { Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Course, CourseSection, CourseSubtopic, CourseEnrollment, CourseReview, ReviewReply } from '../entities';
import { CreateCourseDto, UpdateCourseDto, CreateTopicDto, CreateSubtopicDto } from '../dto';
import { WebSocketGateway } from '../../websocket/websocket.gateway';

/**
 * Courses service for managing course creation, topics, and enrollments
 */
@Injectable()
export class CoursesService {
  private readonly logger = new Logger(CoursesService.name);

  constructor(
    @InjectRepository(Course)
    private courseRepository: Repository<Course>,
    @InjectRepository(CourseSection)
    private courseSectionRepository: Repository<CourseSection>,
    @InjectRepository(CourseSubtopic)
    private courseSubtopicRepository: Repository<CourseSubtopic>,
    @InjectRepository(CourseEnrollment)
    private courseEnrollmentRepository: Repository<CourseEnrollment>,
    @InjectRepository(CourseReview)
    private courseReviewRepository: Repository<CourseReview>,
    @InjectRepository(ReviewReply)
    private reviewReplyRepository: Repository<ReviewReply>,
    @Inject(forwardRef(() => WebSocketGateway))
    private readonly websocketGateway: WebSocketGateway,
  ) {}

  /**
   * Create a new course
   */
  async createCourse(tutorId: string, createCourseDto: CreateCourseDto): Promise<Course> {
    this.logger.log(`Creating course for tutor: ${tutorId}`);

    const course = this.courseRepository.create({
      tutor_user_id: tutorId,
      ...createCourseDto,
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
    tutorId?: string,
  ): Promise<{ courses: Course[]; total: number }> {
    this.logger.log(`Getting courses - page: ${page}, limit: ${limit}`);

    const queryBuilder = this.courseRepository.createQueryBuilder('course')
      .leftJoinAndSelect('course.tutor', 'tutor')
      .orderBy('course.created_at', 'DESC');

    if (tutorId) {
      queryBuilder.andWhere('course.tutor_user_id = :tutorId', { tutorId });
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
  async getCourseById(courseId: string): Promise<any> {
    this.logger.log(`Getting course: ${courseId}`);

    const course = await this.courseRepository.findOne({
      where: { id: courseId },
      relations: ['tutor', 'sections', 'sections.subtopics', 'sections.quizzes', 'sections.quizzes.questions', 'sections.flashcards'],
    });

    if (!course) {
      throw new NotFoundException('Course not found');
    }

    // Format the response to include all course data
    return {
      success: true,
      data: {
        course: {
          id: course.id,
          title: course.title,
          description: course.description,
          price_inr: course.price_inr,
          created_at: course.created_at,
          updated_at: course.updated_at,
          tutor: course.tutor ? {
            id: course.tutor.id,
            name: course.tutor.name,
            email: course.tutor.email,
            image: course.tutor.image,
            user_type: course.tutor.user_type,
            bio: course.tutor.tutor_details?.bio,
            expertise_areas: course.tutor.tutor_details?.expertise_areas,
            specializations: course.tutor.tutor_details?.specializations,
            teaching_experience: course.tutor.tutor_details?.teaching_experience,
            verification_status: course.tutor.tutor_details?.verification_status
          } : null,
          sections: course.sections?.map(section => ({
            id: section.id,
            title: section.title,
            index: section.index,
            subtopics: section.subtopics?.map(subtopic => ({
              id: subtopic.id,
              title: subtopic.title,
              index: subtopic.index,
              video_url: subtopic.video_url,
              status: subtopic.status,
              created_at: subtopic.created_at,
              updated_at: subtopic.updated_at
            })) || [],
            quizzes: section.quizzes?.map(quiz => ({
              id: quiz.id,
              title: quiz.title,
              questions: quiz.questions?.map(question => ({
                id: question.id,
                question: question.question,
                options: question.options,
                correct_index: question.correct_index,
                index: question.index
              })) || []
            })) || [],
            flashcards: section.flashcards?.map(flashcard => ({
              id: flashcard.id,
              front: flashcard.front,
              back: flashcard.back,
              index: flashcard.index
            })) || []
          })) || []
        },
        summary: {
          totalSections: course.sections?.length || 0,
          totalSubtopics: course.sections?.reduce((total, section) => total + (section.subtopics?.length || 0), 0) || 0,
          totalVideos: course.sections?.reduce((total, section) => 
            total + (section.subtopics?.filter(subtopic => subtopic.video_url).length || 0), 0) || 0,
          totalQuizzes: course.sections?.reduce((total, section) => total + (section.quizzes?.length || 0), 0) || 0,
          totalFlashcards: course.sections?.reduce((total, section) => total + (section.flashcards?.length || 0), 0) || 0
        }
      },
      message: 'Course retrieved successfully',
      timestamp: new Date().toISOString()
    };
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

    if (course.tutor_user_id !== tutorId) {
      throw new ForbiddenException('You can only update your own courses');
    }

    Object.assign(course, updateCourseDto);

    const updatedCourse = await this.courseRepository.save(course);
    this.logger.log(`Course updated successfully: ${courseId}`);
    
    return updatedCourse;
  }

  /**
   * Set course price in INR (integer rupees only)
   */
  async setCoursePrice(
    courseId: string,
    tutorId: string,
    priceInINR: number,
  ): Promise<Course> {
    this.logger.log(`Setting course price: ${courseId} to ${priceInINR} INR`);

    // Validate price
    if (!Number.isInteger(priceInINR) || priceInINR < 0) {
      throw new BadRequestException('Price must be a non-negative integer (whole rupees only)');
    }

    // Maximum price limit (1 million INR)
    if (priceInINR > 1000000) {
      throw new BadRequestException('Price cannot exceed 1,000,000 INR');
    }

    const course = await this.getCourseById(courseId);

    // Check tutor ownership
    if (course.tutor_user_id !== tutorId) {
      throw new ForbiddenException('You can only set the price for your own courses');
    }

    // Update price
    course.price_inr = priceInINR;
    const updatedCourse = await this.courseRepository.save(course);
    
    // Emit price update event to course channel
    this.websocketGateway.emitToCourseChannel(courseId, 'price_updated', {
      courseId,
      priceInINR,
      tutorId,
      timestamp: new Date().toISOString(),
    });
    
    this.logger.log(`Course price set successfully: ${courseId} to ${priceInINR} INR`);
    
    return updatedCourse;
  }

  /**
   * Delete course
   */
  async deleteCourse(courseId: string, tutorId: string): Promise<void> {
    this.logger.log(`Deleting course: ${courseId}`);

    const course = await this.getCourseById(courseId);

    if (course.tutor_user_id !== tutorId) {
      throw new ForbiddenException('You can only delete your own courses');
    }

    await this.courseRepository.remove(course);
    this.logger.log(`Course deleted successfully: ${courseId}`);
  }

  /**
   * Create course topic
   */
  async createSection(
    courseId: string,
    tutorId: string,
    createSectionDto: CreateTopicDto,
  ): Promise<CourseSection> {
    this.logger.log(`Creating topic for course: ${courseId}`);

    const course = await this.getCourseById(courseId);

    if (course.tutor_user_id !== tutorId) {
      throw new ForbiddenException('You can only add topics to your own courses');
    }

    const section = this.courseSectionRepository.create({
      course_id: courseId,
      title: createSectionDto.title,
      index: createSectionDto.index || 1,
    });

    const savedSection = await this.courseSectionRepository.save(section);
    
    // Update course section count
    await this.updateCourseSectionCount(courseId);
    
    this.logger.log(`Section created successfully: ${savedSection.id}`);
    return savedSection;
  }

  /**
   * Get course sections
   */
  async getCourseSections(courseId: string): Promise<CourseSection[]> {
    this.logger.log(`Getting sections for course: ${courseId}`);

    return this.courseSectionRepository.find({
      where: { course_id: courseId },
      order: { index: 'ASC' },
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

    const section = await this.courseSectionRepository.findOne({
      where: { id: topicId },
      relations: ['course'],
    });

    if (!section) {
      throw new NotFoundException('Section not found');
    }

    if (section.course!.tutor_user_id !== tutorId) {
      throw new ForbiddenException('You can only add subtopics to your own courses');
    }

    const subtopic = this.courseSubtopicRepository.create({
      section_id: topicId,
      title: createSubtopicDto.title,
      index: createSubtopicDto.index || 1,
      status: 'draft',
    });

    const savedSubtopic = await this.courseSubtopicRepository.save(subtopic);
    
    // Update section and course subtopic counts
    await this.updateSectionSubtopicCount(topicId);
    await this.updateCourseSubtopicCount(section.course_id);
    
    this.logger.log(`Subtopic created successfully: ${savedSubtopic.id}`);
    return savedSubtopic;
  }

  /**
   * Get section subtopics
   */
  async getSectionSubtopics(sectionId: string): Promise<CourseSubtopic[]> {
    this.logger.log(`Getting subtopics for section: ${sectionId}`);

    return this.courseSubtopicRepository.find({
      where: { section_id: sectionId },
      order: { index: 'ASC' },
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
    
    // Note: Course doesn't have status field in actual database
    // Enrollment is always allowed for now

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
   * Get course enrollments (for tutors)
   */
  async getCourseEnrollments(courseId: string, tutorId: string): Promise<CourseEnrollment[]> {
    this.logger.log(`Getting enrollments for course: ${courseId}`);

    const course = await this.getCourseById(courseId);

    if (course.tutor_user_id !== tutorId) {
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
    const count = await this.courseSectionRepository.count({
      where: { course_id: courseId },
    });

    // Note: Course doesn't have section_count field in actual database
    // This method is kept for compatibility but doesn't update anything
    this.logger.log(`Course ${courseId} has ${count} sections`);
  }

  /**
   * Update topic subtopic count
   */
  private async updateSectionSubtopicCount(sectionId: string): Promise<void> {
    const count = await this.courseSubtopicRepository.count({
      where: { section_id: sectionId },
    });

    // Note: CourseSection doesn't have total_subtopics field in the actual database
    // This method is kept for compatibility but doesn't update anything
    this.logger.log(`Section ${sectionId} has ${count} subtopics`);
  }

  /**
   * Update course section count
   */
  private async updateCourseSectionCount(courseId: string): Promise<void> {
    const count = await this.courseSectionRepository.count({
      where: { course_id: courseId },
    });

    // Note: Course doesn't have total_sections field in the actual database
    // This method is kept for compatibility but doesn't update anything
    this.logger.log(`Course ${courseId} has ${count} sections`);
  }

  /**
   * Update course subtopic count
   */
  private async updateCourseSubtopicCount(courseId: string): Promise<void> {
    const count = await this.courseSubtopicRepository
      .createQueryBuilder('subtopic')
      .leftJoin('subtopic.section', 'section')
      .where('section.course_id = :courseId', { courseId })
      .getCount();

    // Note: Course doesn't have total_subtopics field in the actual database
    // This method is kept for compatibility but doesn't update anything
    this.logger.log(`Course ${courseId} has ${count} subtopics`);
  }

  /**
   * Update course enrollment count
   */
  private async updateCourseEnrollmentCount(courseId: string): Promise<void> {
    const count = await this.courseEnrollmentRepository.count({
      where: { course_id: courseId, status: 'active' },
    });

    // Note: Course doesn't have enrollment_count field in the actual database
    // This method is kept for compatibility but doesn't update anything
    this.logger.log(`Course ${courseId} has ${count} enrollments`);
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
        // Note: Course doesn't have rating or review_count fields in actual database
        // This method is kept for compatibility but doesn't update anything
        this.logger.log(`Course ${courseId} average rating: ${Math.round(averageRating * 100) / 100}, review count: ${reviews.length}`);
      }
    } catch (error) {
      this.logger.error(`Failed to update course rating:`, error);
    }
  }

  /**
   * Get all platform courses with pagination and filters
   */
  async getAllPlatformCourses(filters: {
    page: number;
    limit: number;
    search?: string;
  }): Promise<{ courses: any[]; total: number; page: number; limit: number }> {
    const { page, limit, search } = filters;
    const skip = (page - 1) * limit;

    const queryBuilder = this.courseRepository
      .createQueryBuilder('course')
      .leftJoinAndSelect('course.tutor', 'tutor')
      .leftJoinAndSelect('course.sections', 'sections')
      .leftJoinAndSelect('sections.subtopics', 'subtopics');

    if (search) {
      queryBuilder.andWhere(
        '(course.title ILIKE :search OR course.description ILIKE :search)',
        { search: `%${search}%` }
      );
    }

    const [courses, total] = await queryBuilder
      .orderBy('course.created_at', 'DESC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    // Format the response with clean tutor information
    const formattedCourses = courses.map(course => ({
      id: course.id,
      title: course.title,
      description: course.description,
      price_inr: course.price_inr,
      created_at: course.created_at,
      updated_at: course.updated_at,
      tutor: course.tutor ? {
        id: course.tutor.id,
        name: course.tutor.name,
        email: course.tutor.email,
        image: course.tutor.image,
        user_type: course.tutor.user_type,
        bio: course.tutor.tutor_details?.bio,
        expertise_areas: course.tutor.tutor_details?.expertise_areas,
        specializations: course.tutor.tutor_details?.specializations,
        teaching_experience: course.tutor.tutor_details?.teaching_experience,
        verification_status: course.tutor.tutor_details?.verification_status
      } : null,
      sections: course.sections?.map(section => ({
        id: section.id,
        title: section.title,
        index: section.index,
        subtopics: section.subtopics?.map(subtopic => ({
          id: subtopic.id,
          title: subtopic.title,
          index: subtopic.index,
          video_url: subtopic.video_url,
          status: subtopic.status
        }))
      }))
    }));

    return {
      courses: formattedCourses,
      total,
      page,
      limit,
    };
  }

  /**
   * Get courses for a specific student
   */
  async getStudentCourses(studentId: string, page: number = 1, limit: number = 10): Promise<{ courses: Course[]; total: number; page: number; limit: number }> {
    const skip = (page - 1) * limit;

    const queryBuilder = this.courseRepository
      .createQueryBuilder('course')
      .leftJoinAndSelect('course.sections', 'sections')
      .leftJoinAndSelect('sections.subtopics', 'subtopics')
      .leftJoin('course.enrollments', 'enrollment')
      .where('enrollment.user_id = :studentId', { studentId })
      .andWhere('enrollment.role = :role', { role: 'student' });

    const [courses, total] = await queryBuilder
      .orderBy('course.created_at', 'DESC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    return {
      courses,
      total,
      page,
      limit,
    };
  }

  /**
   * Generate secure video stream URL
   */
  async generateSecureVideoStreamUrl(userId: string, courseId: string, subtopicId: string): Promise<{ streamUrl: string; expiresAt: string }> {
    // Verify user has access to the course
    const hasAccess = await this.verifyUserCourseAccess(userId, courseId);
    if (!hasAccess) {
      throw new ForbiddenException('Access denied to this course');
    }

    // Generate secure URL with expiration (1 hour)
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const streamUrl = `/api/courses/${courseId}/subtopics/${subtopicId}/stream?token=${this.generateStreamToken(userId, courseId, subtopicId)}`;

    return {
      streamUrl,
      expiresAt,
    };
  }

  /**
   * Get course generation progress
   */
  async getCourseGenerationProgress(courseId: string, userId: string): Promise<any> {
    // Verify user has access to the course
    const hasAccess = await this.verifyUserCourseAccess(userId, courseId);
    if (!hasAccess) {
      throw new ForbiddenException('Access denied to this course');
    }

    // This would typically query the course_generation_progress table
    // For now, return a mock response
    return {
      courseId,
      status: 'processing',
      progress: 75,
      currentStep: 'generating_videos',
      estimatedTimeRemaining: 15,
    };
  }

  /**
   * Get course analytics
   */
  async getCourseAnalytics(courseId: string, userId: string): Promise<any> {
    // Verify user has access to the course
    const hasAccess = await this.verifyUserCourseAccess(userId, courseId);
    if (!hasAccess) {
      throw new ForbiddenException('Access denied to this course');
    }

    // This would typically query various tables for analytics
    // For now, return a mock response
    return {
      courseId,
      totalEnrollments: 0,
      totalRevenue: 0,
      averageRating: 0,
      completionRate: 0,
    };
  }

  /**
   * Get student enrollments for a user
   */
  async getStudentEnrollments(userId: string): Promise<CourseEnrollment[]> {
    return this.courseEnrollmentRepository.find({
      where: { student_id: userId },
      relations: ['course'],
    });
  }


  /**
   * Generate stream token for secure video access
   */
  private generateStreamToken(userId: string, courseId: string, subtopicId: string): string {
    // This would typically generate a JWT token with expiration
    // For now, return a simple hash
    return Buffer.from(`${userId}:${courseId}:${subtopicId}:${Date.now()}`).toString('base64');
  }

  // Phase 5: Additional Methods Implementation

  /**
   * Publish course with pricing
   */
  async publishCourse(courseId: string, tutorId: string, priceInINR: number): Promise<Course> {
    const course = await this.courseRepository.findOne({
      where: { id: courseId, tutor_user_id: tutorId }
    });

    if (!course) {
      throw new NotFoundException('Course not found or access denied');
    }

    if (priceInINR < 0) {
      throw new BadRequestException('Price must be non-negative');
    }

    course.price_inr = priceInINR;
    course.updated_at = new Date();

    return this.courseRepository.save(course);
  }

  /**
   * Get courses by specific tutor
   */
  async getTutorCourses(tutorId: string, page: number = 1, limit: number = 10): Promise<{ courses: Course[]; total: number }> {
    const [courses, total] = await this.courseRepository.findAndCount({
      where: { tutor_user_id: tutorId },
      skip: (page - 1) * limit,
      take: limit,
      order: { created_at: 'DESC' }
    });

    return { courses, total };
  }

  /**
   * Search courses with filters
   */
  async searchCourses(filters: {
    searchQuery?: string;
    priceMin?: number;
    priceMax?: number;
    page: number;
    limit: number;
  }): Promise<{ courses: Course[]; total: number }> {
    const queryBuilder = this.courseRepository.createQueryBuilder('course');

    if (filters.searchQuery) {
      queryBuilder.andWhere('course.title ILIKE :search', { search: `%${filters.searchQuery}%` });
    }

    if (filters.priceMin !== undefined) {
      queryBuilder.andWhere('course.price_inr >= :priceMin', { priceMin: filters.priceMin });
    }

    if (filters.priceMax !== undefined) {
      queryBuilder.andWhere('course.price_inr <= :priceMax', { priceMax: filters.priceMax });
    }

    queryBuilder
      .skip((filters.page - 1) * filters.limit)
      .take(filters.limit)
      .orderBy('course.created_at', 'DESC');

    const [courses, total] = await queryBuilder.getManyAndCount();

    return { courses, total };
  }

  /**
   * Get course details with access control
   */
  async getCourseDetails(courseId: string, userId?: string): Promise<any> {
    const course = await this.courseRepository.findOne({
      where: { id: courseId },
      relations: ['tutor', 'sections', 'sections.subtopics']
    });

    if (!course) {
      throw new NotFoundException('Course not found');
    }

    // Check if user has access to video URLs
    let hasAccess = false;
    if (userId) {
      // Check if user is tutor, admin, or enrolled student
      const enrollment = await this.courseEnrollmentRepository.findOne({
        where: { course_id: courseId, student_id: userId }
      });
      hasAccess = course.tutor_user_id === userId || !!enrollment; // Add admin check
    }

    // Remove video URLs if no access
    if (!hasAccess) {
      course.sections?.forEach(section => {
        section.subtopics?.forEach(subtopic => {
          delete subtopic.video_url;
        });
      });
    }

    return course;
  }

  /**
   * Get course quizzes
   */
  async getCourseQuizzes(courseId: string, userId: string): Promise<any> {
    // Check if user has access to course
    const hasAccess = await this.verifyUserCourseAccess(userId, courseId);
    if (!hasAccess) {
      throw new ForbiddenException('Access denied - not enrolled in course');
    }

    // Get quizzes for course
    const quizzes = await this.courseRepository
      .createQueryBuilder('course')
      .leftJoinAndSelect('course.sections', 'sections')
      .leftJoinAndSelect('sections.quizzes', 'quizzes')
      .leftJoinAndSelect('quizzes.questions', 'questions')
      .where('course.id = :courseId', { courseId })
      .getOne();

    return quizzes?.sections?.flatMap(section => section.quizzes || []) || [];
  }

  /**
   * Get course flashcards
   */
  async getCourseFlashcards(courseId: string, userId: string): Promise<any> {
    // Check if user has access to course
    const hasAccess = await this.verifyUserCourseAccess(userId, courseId);
    if (!hasAccess) {
      throw new ForbiddenException('Access denied - not enrolled in course');
    }

    // Get flashcards for course
    const flashcards = await this.courseRepository
      .createQueryBuilder('course')
      .leftJoinAndSelect('course.sections', 'sections')
      .leftJoinAndSelect('sections.flashcards', 'flashcards')
      .where('course.id = :courseId', { courseId })
      .getOne();

    return flashcards?.sections?.flatMap(section => section.flashcards || []) || [];
  }

  /**
   * Submit quiz attempt
   */
  async submitQuizAttempt(courseId: string, quizId: string, userId: string, attemptData: { answers: number[]; timeTaken: number }): Promise<any> {
    // Check if user has access to course
    const hasAccess = await this.verifyUserCourseAccess(userId, courseId);
    if (!hasAccess) {
      throw new ForbiddenException('Access denied - not enrolled in course');
    }

    // Get quiz questions
    const quiz = await this.courseRepository
      .createQueryBuilder('course')
      .leftJoinAndSelect('course.sections', 'sections')
      .leftJoinAndSelect('sections.quizzes', 'quizzes')
      .leftJoinAndSelect('quizzes.questions', 'questions')
      .where('course.id = :courseId', { courseId })
      .andWhere('quizzes.id = :quizId', { quizId })
      .getOne();

    if (!quiz) {
      throw new NotFoundException('Quiz not found');
    }

    const quizQuestions = quiz.sections?.flatMap(section => 
      section.quizzes?.flatMap(quiz => quiz.questions || []) || []
    ) || [];

    // Calculate score
    let correctAnswers = 0;
    quizQuestions.forEach((question, index) => {
      if (attemptData.answers[index] === question.correct_index) {
        correctAnswers++;
      }
    });

    const score = Math.round((correctAnswers / quizQuestions.length) * 100);

    // Save quiz attempt
    const quizAttempt = this.courseRepository.manager.create('QuizAttempt', {
      quiz_id: quizId,
      user_id: userId,
      score: correctAnswers,
      total_questions: quizQuestions.length,
      answers: attemptData.answers,
      time_taken_seconds: attemptData.timeTaken,
    });

    await this.courseRepository.manager.save('QuizAttempt', quizAttempt);

    return {
      score,
      correctAnswers,
      totalQuestions: quizQuestions.length,
      timeTaken: attemptData.timeTaken
    };
  }

  /**
   * Get student progress in course
   */
  async getStudentProgress(courseId: string, studentId: string, requestingUserId: string): Promise<any> {
    // Check if requesting user has access
    const isTutor = await this.courseRepository.findOne({
      where: { id: courseId, tutor_user_id: requestingUserId }
    });

    const isStudent = studentId === requestingUserId;
    const isAdmin = false; // Add admin check

    if (!isTutor && !isStudent && !isAdmin) {
      throw new ForbiddenException('Access denied');
    }

    // Get student progress
    const progress = await this.courseRepository
      .createQueryBuilder('course')
      .leftJoinAndSelect('course.sections', 'sections')
      .leftJoinAndSelect('sections.subtopics', 'subtopics')
      .leftJoinAndSelect('subtopics.progress', 'progress', 'progress.user_id = :studentId', { studentId })
      .where('course.id = :courseId', { courseId })
      .getOne();

    return progress;
  }

  /**
   * Verify user has access to course
   */
  private async verifyUserCourseAccess(userId: string, courseId: string): Promise<boolean> {
    // Check if user is enrolled
    const enrollment = await this.courseEnrollmentRepository.findOne({
      where: { course_id: courseId, student_id: userId }
    });

    if (enrollment) {
      return true;
    }

    // Check if user is tutor
    const course = await this.courseRepository.findOne({
      where: { id: courseId, tutor_user_id: userId }
    });

    return !!course;
  }
}
