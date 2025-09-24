import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category, CourseCategory, Recommendation } from '../entities';
import { CreateCategoryDto, UpdateCategoryDto, AssignCourseCategoryDto, GenerateRecommendationsDto, TrackRecommendationClickDto } from '../dto';
import { Course } from '../../courses/entities/course.entity';
import { CourseEnrollment } from '../../courses/entities/course-enrollment.entity';
import { VideoProgress } from '../../progress/entities/video-progress.entity';

@Injectable()
export class CategoryService {
  constructor(
    @InjectRepository(Category)
    private categoryRepository: Repository<Category>,
    @InjectRepository(CourseCategory)
    private courseCategoryRepository: Repository<CourseCategory>,
    @InjectRepository(Recommendation)
    private recommendationRepository: Repository<Recommendation>,
    @InjectRepository(Course)
    private courseRepository: Repository<Course>,
    @InjectRepository(CourseEnrollment)
    private enrollmentRepository: Repository<CourseEnrollment>,
    @InjectRepository(VideoProgress)
    private videoProgressRepository: Repository<VideoProgress>,
  ) {}

  async createCategory(createDto: CreateCategoryDto): Promise<Category> {
    // Check if parent category exists
    if (createDto.parent_id) {
      const parentCategory = await this.categoryRepository.findOne({
        where: { id: createDto.parent_id },
      });

      if (!parentCategory) {
        throw new NotFoundException('Parent category not found');
      }

      (createDto as any).level = parentCategory.level + 1;
    } else {
      (createDto as any).level = 0;
    }

    const category = this.categoryRepository.create(createDto);
    return this.categoryRepository.save(category);
  }

  async updateCategory(categoryId: string, updateDto: UpdateCategoryDto): Promise<Category> {
    const category = await this.categoryRepository.findOne({
      where: { id: categoryId },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    // Check if parent category exists and prevent circular references
    if (updateDto.parent_id) {
      if (updateDto.parent_id === categoryId) {
        throw new BadRequestException('Category cannot be its own parent');
      }

      const parentCategory = await this.categoryRepository.findOne({
        where: { id: updateDto.parent_id },
      });

      if (!parentCategory) {
        throw new NotFoundException('Parent category not found');
      }

      (updateDto as any).level = parentCategory.level + 1;
    }

    Object.assign(category, updateDto);
    return this.categoryRepository.save(category);
  }

  async getCategory(categoryId: string): Promise<Category> {
    const category = await this.categoryRepository.findOne({
      where: { id: categoryId },
      relations: ['parent', 'children', 'courses'],
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    return category;
  }

  async getCategories(parentId?: string, includeInactive: boolean = false): Promise<Category[]> {
    const queryBuilder = this.categoryRepository
      .createQueryBuilder('category')
      .leftJoinAndSelect('category.parent', 'parent')
      .leftJoinAndSelect('category.children', 'children')
      .orderBy('category.order_index', 'ASC')
      .addOrderBy('category.name', 'ASC');

    if (parentId) {
      queryBuilder.where('category.parent_id = :parentId', { parentId });
    } else {
      queryBuilder.where('category.parent_id IS NULL');
    }

    if (!includeInactive) {
      queryBuilder.andWhere('category.is_active = :isActive', { isActive: true });
    }

    return queryBuilder.getMany();
  }

  async getCategoryTree(): Promise<Category[]> {
    const categories = await this.categoryRepository
      .createQueryBuilder('category')
      .leftJoinAndSelect('category.children', 'children')
      .where('category.parent_id IS NULL')
      .andWhere('category.is_active = :isActive', { isActive: true })
      .orderBy('category.order_index', 'ASC')
      .addOrderBy('category.name', 'ASC')
      .getMany();

    return categories;
  }

  async deleteCategory(categoryId: string): Promise<void> {
    const category = await this.categoryRepository.findOne({
      where: { id: categoryId },
      relations: ['children', 'courses'],
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    if (category.children && category.children.length > 0) {
      throw new BadRequestException('Cannot delete category with subcategories');
    }

    if (category.courses && category.courses.length > 0) {
      throw new BadRequestException('Cannot delete category with associated courses');
    }

    await this.categoryRepository.remove(category);
  }

  async assignCourseToCategory(assignDto: AssignCourseCategoryDto): Promise<CourseCategory> {
    // Check if course exists
    const course = await this.courseRepository.findOne({
      where: { id: assignDto.course_id },
    });

    if (!course) {
      throw new NotFoundException('Course not found');
    }

    // Check if category exists
    const category = await this.categoryRepository.findOne({
      where: { id: assignDto.category_id },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    // Check if assignment already exists
    const existingAssignment = await this.courseCategoryRepository.findOne({
      where: {
        course_id: assignDto.course_id,
        category_id: assignDto.category_id,
      },
    });

    if (existingAssignment) {
      throw new BadRequestException('Course is already assigned to this category');
    }

    // If this is set as primary, unset other primary categories for this course
    if (assignDto.is_primary) {
      await this.courseCategoryRepository.update(
        { course_id: assignDto.course_id },
        { is_primary: false }
      );
    }

    const courseCategory = this.courseCategoryRepository.create(assignDto);
    return this.courseCategoryRepository.save(courseCategory);
  }

  async removeCourseFromCategory(courseId: string, categoryId: string): Promise<void> {
    const courseCategory = await this.courseCategoryRepository.findOne({
      where: {
        course_id: courseId,
        category_id: categoryId,
      },
    });

    if (!courseCategory) {
      throw new NotFoundException('Course category assignment not found');
    }

    await this.courseCategoryRepository.remove(courseCategory);
  }

  async getCoursesByCategory(categoryId: string, page: number = 1, limit: number = 10): Promise<{ courses: Course[]; total: number }> {
    const [courses, total] = await this.courseRepository
      .createQueryBuilder('course')
      .leftJoin('course.courseCategories', 'courseCategory')
      .leftJoinAndSelect('course.tutor', 'tutor')
      .leftJoinAndSelect('courseCategory.category', 'category')
      .where('courseCategory.category_id = :categoryId', { categoryId })
      .andWhere('course.status = :status', { status: 'published' })
      .orderBy('course.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { courses, total };
  }

  async generateRecommendations(generateDto: GenerateRecommendationsDto): Promise<Recommendation[]> {
    const { user_id, type = 'personalized', limit = 10, category_id } = generateDto;

    // Clear existing recommendations for this user and type
    await this.recommendationRepository.delete({
      user_id,
      type,
    });

    let recommendations: Recommendation[] = [];

    switch (type) {
      case 'trending':
        recommendations = await this.generateTrendingRecommendations(user_id, limit, category_id);
        break;
      case 'similar_courses':
        recommendations = await this.generateSimilarCourseRecommendations(user_id, limit, category_id);
        break;
      case 'category_based':
        recommendations = await this.generateCategoryBasedRecommendations(user_id, limit, category_id);
        break;
      case 'collaborative_filtering':
        recommendations = await this.generateCollaborativeFilteringRecommendations(user_id, limit, category_id);
        break;
      case 'personalized':
      default:
        recommendations = await this.generatePersonalizedRecommendations(user_id, limit, category_id);
        break;
    }

    // Save recommendations
    const savedRecommendations = await this.recommendationRepository.save(recommendations);

    return savedRecommendations;
  }

  async getRecommendations(userId: string, type?: string, limit: number = 10): Promise<Recommendation[]> {
    const queryBuilder = this.recommendationRepository
      .createQueryBuilder('recommendation')
      .leftJoinAndSelect('recommendation.course', 'course')
      .leftJoinAndSelect('course.tutor', 'tutor')
      .where('recommendation.user_id = :userId', { userId })
      .andWhere('recommendation.status = :status', { status: 'active' })
      .andWhere('(recommendation.expires_at IS NULL OR recommendation.expires_at > :now)', { now: new Date() })
      .orderBy('recommendation.score', 'DESC')
      .addOrderBy('recommendation.position', 'ASC')
      .limit(limit);

    if (type) {
      queryBuilder.andWhere('recommendation.type = :type', { type });
    }

    return queryBuilder.getMany();
  }

  async trackRecommendationClick(trackDto: TrackRecommendationClickDto): Promise<Recommendation> {
    const recommendation = await this.recommendationRepository.findOne({
      where: { id: trackDto.recommendation_id },
    });

    if (!recommendation) {
      throw new NotFoundException('Recommendation not found');
    }

    recommendation.is_clicked = true;
    recommendation.clicked_at = new Date();

    if (trackDto.position) {
      recommendation.position = trackDto.position;
    }

    return this.recommendationRepository.save(recommendation);
  }

  private async generateTrendingRecommendations(userId: string, limit: number, categoryId?: string): Promise<Recommendation[]> {
    const queryBuilder = this.courseRepository
      .createQueryBuilder('course')
      .leftJoin('course.enrollments', 'enrollment')
      .leftJoin('course.courseCategories', 'courseCategory')
      .where('course.status = :status', { status: 'published' })
      .andWhere('course.id NOT IN (SELECT enrollment.course_id FROM course_enrollments enrollment WHERE enrollment.student_id = :userId)', { userId })
      .select([
        'course.id',
        'COUNT(enrollment.id) as enrollment_count',
        'course.rating',
        'course.created_at',
      ])
      .groupBy('course.id, course.rating, course.created_at')
      .orderBy('enrollment_count', 'DESC')
      .addOrderBy('course.rating', 'DESC')
      .limit(limit);

    if (categoryId) {
      queryBuilder.andWhere('courseCategory.category_id = :categoryId', { categoryId });
    }

    const trendingCourses = await queryBuilder.getRawMany();

    return trendingCourses.map((course, index) => 
      this.recommendationRepository.create({
        user_id: userId,
        course_id: course.course_id,
        type: 'trending',
        score: this.calculateTrendingScore(course.enrollment_count, course.rating),
        position: index + 1,
        reason: 'Popular course with high enrollment',
        metadata: {
          algorithm_version: '1.0',
          confidence_score: 0.8,
          factors: ['enrollment_count', 'rating'],
          generated_at: new Date().toISOString(),
        },
      })
    );
  }

  private async generateSimilarCourseRecommendations(userId: string, limit: number, categoryId?: string): Promise<Recommendation[]> {
    // Get user's enrolled courses
    const userEnrollments = await this.enrollmentRepository.find({
      where: { student_id: userId },
      relations: ['course'],
    });

    if (userEnrollments.length === 0) {
      return this.generateTrendingRecommendations(userId, limit, categoryId);
    }

    const enrolledCourseIds = userEnrollments.map(e => e.course_id);
    const enrolledCategories = await this.courseCategoryRepository
      .createQueryBuilder('courseCategory')
      .leftJoin('courseCategory.course', 'course')
      .where('course.id IN (:...courseIds)', { courseIds: enrolledCourseIds })
      .getMany();

    const categoryIds = [...new Set(enrolledCategories.map(cc => cc.category_id))];

    // Find similar courses
    const similarCourses = await this.courseRepository
      .createQueryBuilder('course')
      .leftJoin('course.courseCategories', 'courseCategory')
      .where('course.status = :status', { status: 'published' })
      .andWhere('course.id NOT IN (:...enrolledCourseIds)', { enrolledCourseIds })
      .andWhere('courseCategory.category_id IN (:...categoryIds)', { categoryIds })
      .select([
        'course.id',
        'course.rating',
        'course.price',
        'COUNT(courseCategory.id) as matching_categories',
      ])
      .groupBy('course.id, course.rating, course.price')
      .orderBy('matching_categories', 'DESC')
      .addOrderBy('course.rating', 'DESC')
      .limit(limit)
      .getRawMany();

    return similarCourses.map((course, index) => 
      this.recommendationRepository.create({
        user_id: userId,
        course_id: course.course_id,
        type: 'similar_courses',
        score: this.calculateSimilarityScore(course.matching_categories, course.rating),
        position: index + 1,
        reason: 'Similar to courses you\'ve enrolled in',
        metadata: {
          algorithm_version: '1.0',
          confidence_score: 0.8,
          factors: ['matching_categories', 'rating'],
          generated_at: new Date().toISOString(),
        },
      })
    );
  }

  private async generateCategoryBasedRecommendations(userId: string, limit: number, categoryId?: string): Promise<Recommendation[]> {
    // Get user's preferred categories based on enrollment history
    const userCategories = await this.courseCategoryRepository
      .createQueryBuilder('courseCategory')
      .leftJoin('courseCategory.course', 'course')
      .leftJoin('course.enrollments', 'enrollment')
      .where('enrollment.student_id = :userId', { userId })
      .select([
        'courseCategory.category_id',
        'COUNT(enrollment.id) as enrollment_count',
      ])
      .groupBy('courseCategory.category_id')
      .orderBy('enrollment_count', 'DESC')
      .limit(5)
      .getRawMany();

    const preferredCategoryIds = userCategories.map(uc => uc.category_id);

    if (preferredCategoryIds.length === 0) {
      return this.generateTrendingRecommendations(userId, limit, categoryId);
    }

    const targetCategoryId = categoryId || preferredCategoryIds[0];

    const categoryCourses = await this.courseRepository
      .createQueryBuilder('course')
      .leftJoin('course.courseCategories', 'courseCategory')
      .leftJoin('course.enrollments', 'enrollment')
      .where('course.status = :status', { status: 'published' })
      .andWhere('courseCategory.category_id = :categoryId', { categoryId: targetCategoryId })
      .andWhere('course.id NOT IN (SELECT enrollment.course_id FROM course_enrollments enrollment WHERE enrollment.student_id = :userId)', { userId })
      .select([
        'course.id',
        'course.rating',
        'course.price',
        'COUNT(enrollment.id) as enrollment_count',
      ])
      .groupBy('course.id, course.rating, course.price')
      .orderBy('course.rating', 'DESC')
      .addOrderBy('enrollment_count', 'DESC')
      .limit(limit)
      .getRawMany();

    return categoryCourses.map((course, index) => 
      this.recommendationRepository.create({
        user_id: userId,
        course_id: course.course_id,
        type: 'category_based',
        score: this.calculateCategoryScore(course.rating, course.enrollment_count),
        position: index + 1,
        reason: 'Based on your category preferences',
        metadata: {
          algorithm_version: '1.0',
          confidence_score: 0.8,
          factors: ['category_id', 'rating'],
          generated_at: new Date().toISOString(),
        },
      })
    );
  }

  private async generateCollaborativeFilteringRecommendations(userId: string, limit: number, categoryId?: string): Promise<Recommendation[]> {
    // Find users with similar enrollment patterns
    const similarUsers = await this.enrollmentRepository
      .createQueryBuilder('enrollment1')
      .leftJoin('enrollment1.course', 'course1')
      .leftJoin('course1.courseCategories', 'courseCategory1')
      .leftJoin('course_enrollments', 'enrollment2', 'enrollment2.course_id = enrollment1.course_id')
      .where('enrollment1.student_id = :userId', { userId })
      .andWhere('enrollment2.student_id != :userId', { userId })
      .select([
        'enrollment2.student_id',
        'COUNT(enrollment2.id) as common_courses',
      ])
      .groupBy('enrollment2.student_id')
      .having('COUNT(enrollment2.id) >= 2')
      .orderBy('common_courses', 'DESC')
      .limit(10)
      .getRawMany();

    if (similarUsers.length === 0) {
      return this.generateTrendingRecommendations(userId, limit, categoryId);
    }

    const similarUserIds = similarUsers.map(su => su.student_id);

    // Get courses that similar users enrolled in but current user hasn't
    const collaborativeCourses = await this.courseRepository
      .createQueryBuilder('course')
      .leftJoin('course.enrollments', 'enrollment')
      .leftJoin('course.courseCategories', 'courseCategory')
      .where('course.status = :status', { status: 'published' })
      .andWhere('enrollment.student_id IN (:...similarUserIds)', { similarUserIds })
      .andWhere('course.id NOT IN (SELECT enrollment.course_id FROM course_enrollments enrollment WHERE enrollment.student_id = :userId)', { userId })
      .select([
        'course.id',
        'course.rating',
        'COUNT(DISTINCT enrollment.student_id) as similar_user_count',
      ])
      .groupBy('course.id, course.rating')
      .orderBy('similar_user_count', 'DESC')
      .addOrderBy('course.rating', 'DESC')
      .limit(limit)
      .getRawMany();

    return collaborativeCourses.map((course, index) => 
      this.recommendationRepository.create({
        user_id: userId,
        course_id: course.course_id,
        type: 'collaborative_filtering',
        score: this.calculateCollaborativeScore(course.similar_user_count, course.rating),
        position: index + 1,
        reason: 'Users with similar interests also enrolled in this course',
        metadata: {
          algorithm_version: '1.0',
          confidence_score: 0.8,
          factors: ['similar_user_count', 'rating'],
          generated_at: new Date().toISOString(),
        },
      })
    );
  }

  private async generatePersonalizedRecommendations(userId: string, limit: number, categoryId?: string): Promise<Recommendation[]> {
    // Combine multiple recommendation strategies
    const [trending, similar, categoryBased, collaborative] = await Promise.all([
      this.generateTrendingRecommendations(userId, Math.ceil(limit * 0.3), categoryId),
      this.generateSimilarCourseRecommendations(userId, Math.ceil(limit * 0.3), categoryId),
      this.generateCategoryBasedRecommendations(userId, Math.ceil(limit * 0.2), categoryId),
      this.generateCollaborativeFilteringRecommendations(userId, Math.ceil(limit * 0.2), categoryId),
    ]);

    // Combine and deduplicate recommendations
    const allRecommendations = [...trending, ...similar, ...categoryBased, ...collaborative];
    const uniqueRecommendations = allRecommendations.filter((rec, index, self) => 
      index === self.findIndex(r => r.course_id === rec.course_id)
    );

    // Sort by score and take top recommendations
    return uniqueRecommendations
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((rec, index) => ({
        ...rec,
        type: 'personalized' as const,
        position: index + 1,
        reason: 'Personalized recommendation based on your learning patterns',
      }));
  }

  private calculateTrendingScore(enrollmentCount: number, rating: number): number {
    return (enrollmentCount * 0.7) + (rating * 0.3);
  }

  private calculateSimilarityScore(matchingCategories: number, rating: number): number {
    return (matchingCategories * 0.6) + (rating * 0.4);
  }

  private calculateCategoryScore(rating: number, enrollmentCount: number): number {
    return (rating * 0.8) + (enrollmentCount * 0.2);
  }

  private calculateCollaborativeScore(similarUserCount: number, rating: number): number {
    return (similarUserCount * 0.5) + (rating * 0.5);
  }
}
