import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Wishlist } from '../entities';
import { AddToWishlistDto, UpdateWishlistItemDto } from '../dto';
import { Course } from '../../courses/entities/course.entity';
import { CourseEnrollment } from '../../courses/entities/course-enrollment.entity';

@Injectable()
export class WishlistService {
  constructor(
    @InjectRepository(Wishlist)
    private wishlistRepository: Repository<Wishlist>,
    @InjectRepository(Course)
    private courseRepository: Repository<Course>,
    @InjectRepository(CourseEnrollment)
    private enrollmentRepository: Repository<CourseEnrollment>,
  ) {}

  async addToWishlist(addDto: AddToWishlistDto, studentId: string): Promise<Wishlist> {
    // Check if course exists
    const course = await this.courseRepository.findOne({
      where: { id: addDto.course_id },
    });

    if (!course) {
      throw new NotFoundException('Course not found');
    }

    // Check if student is already enrolled in the course
    const enrollment = await this.enrollmentRepository.findOne({
      where: {
        student_id: studentId,
        course_id: addDto.course_id,
      },
    });

    if (enrollment) {
      throw new BadRequestException('Course is already enrolled');
    }

    // Check if course is already in wishlist
    const existingWishlistItem = await this.wishlistRepository.findOne({
      where: {
        student_id: studentId,
        course_id: addDto.course_id,
      },
    });

    if (existingWishlistItem) {
      throw new BadRequestException('Course is already in wishlist');
    }

    const wishlistItem = this.wishlistRepository.create({
      ...addDto,
      student_id: studentId,
      priority: addDto.priority || 1,
      is_notification_enabled: addDto.is_notification_enabled ?? true,
    });

    if (addDto.target_date) {
      wishlistItem.target_date = new Date(addDto.target_date);
    }

    return this.wishlistRepository.save(wishlistItem);
  }

  async updateWishlistItem(wishlistId: string, updateDto: UpdateWishlistItemDto, studentId: string): Promise<Wishlist> {
    const wishlistItem = await this.wishlistRepository.findOne({
      where: {
        id: wishlistId,
        student_id: studentId,
      },
    });

    if (!wishlistItem) {
      throw new NotFoundException('Wishlist item not found');
    }

    Object.assign(wishlistItem, updateDto);

    if (updateDto.target_date) {
      wishlistItem.target_date = new Date(updateDto.target_date);
    }

    return this.wishlistRepository.save(wishlistItem);
  }

  async removeFromWishlist(wishlistId: string, studentId: string): Promise<void> {
    const wishlistItem = await this.wishlistRepository.findOne({
      where: {
        id: wishlistId,
        student_id: studentId,
      },
    });

    if (!wishlistItem) {
      throw new NotFoundException('Wishlist item not found');
    }

    await this.wishlistRepository.remove(wishlistItem);
  }

  async removeCourseFromWishlist(courseId: string, studentId: string): Promise<void> {
    const wishlistItem = await this.wishlistRepository.findOne({
      where: {
        course_id: courseId,
        student_id: studentId,
      },
    });

    if (!wishlistItem) {
      throw new NotFoundException('Course not found in wishlist');
    }

    await this.wishlistRepository.remove(wishlistItem);
  }

  async getWishlist(studentId: string, listName?: string, page: number = 1, limit: number = 10): Promise<{ items: Wishlist[]; total: number }> {
    const queryBuilder = this.wishlistRepository
      .createQueryBuilder('wishlist')
      .leftJoinAndSelect('wishlist.course', 'course')
      .leftJoinAndSelect('course.tutor', 'tutor')
      .leftJoinAndSelect('course.category', 'category')
      .where('wishlist.student_id = :studentId', { studentId })
      .orderBy('wishlist.priority', 'DESC')
      .addOrderBy('wishlist.created_at', 'DESC');

    if (listName) {
      queryBuilder.andWhere('wishlist.list_name = :listName', { listName });
    }

    const [items, total] = await queryBuilder
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { items, total };
  }

  async getWishlistItem(wishlistId: string, studentId: string): Promise<Wishlist> {
    const wishlistItem = await this.wishlistRepository.findOne({
      where: {
        id: wishlistId,
        student_id: studentId,
      },
      relations: ['course', 'course.tutor', 'course.category'],
    });

    if (!wishlistItem) {
      throw new NotFoundException('Wishlist item not found');
    }

    return wishlistItem;
  }

  async getWishlistLists(studentId: string): Promise<string[]> {
    const lists = await this.wishlistRepository
      .createQueryBuilder('wishlist')
      .select('DISTINCT wishlist.list_name', 'list_name')
      .where('wishlist.student_id = :studentId', { studentId })
      .andWhere('wishlist.list_name IS NOT NULL')
      .getRawMany();

    return lists.map(list => list.list_name);
  }

  async getWishlistStats(studentId: string): Promise<any> {
    const stats = await this.wishlistRepository
      .createQueryBuilder('wishlist')
      .leftJoin('wishlist.course', 'course')
      .select([
        'COUNT(wishlist.id) as total_items',
        'COUNT(CASE WHEN course.price <= 0 THEN 1 END) as free_courses',
        'COUNT(CASE WHEN course.price > 0 THEN 1 END) as paid_courses',
        'AVG(course.price) as average_price',
        'MIN(course.price) as min_price',
        'MAX(course.price) as max_price',
      ])
      .where('wishlist.student_id = :studentId', { studentId })
      .getRawOne();

    const priorityDistribution = await this.wishlistRepository
      .createQueryBuilder('wishlist')
      .select([
        'wishlist.priority',
        'COUNT(wishlist.id) as count',
      ])
      .where('wishlist.student_id = :studentId', { studentId })
      .groupBy('wishlist.priority')
      .getRawMany();

    return {
      total_items: parseInt(stats.total_items) || 0,
      free_courses: parseInt(stats.free_courses) || 0,
      paid_courses: parseInt(stats.paid_courses) || 0,
      average_price: parseFloat(stats.average_price) || 0,
      min_price: parseFloat(stats.min_price) || 0,
      max_price: parseFloat(stats.max_price) || 0,
      priority_distribution: priorityDistribution,
      generated_at: new Date().toISOString(),
    };
  }

  async checkPriceAlerts(studentId: string): Promise<any[]> {
    const alerts = await this.wishlistRepository
      .createQueryBuilder('wishlist')
      .leftJoinAndSelect('wishlist.course', 'course')
      .where('wishlist.student_id = :studentId', { studentId })
      .andWhere('wishlist.is_notification_enabled = :enabled', { enabled: true })
      .andWhere('wishlist.target_price IS NOT NULL')
      .andWhere('course.price <= wishlist.target_price')
      .andWhere('course.price > 0')
      .getMany();

    return alerts.map(alert => ({
      wishlist_id: alert.id,
      course_id: alert.course_id,
      course_title: alert.course?.title,
      current_price: alert.course?.price,
      target_price: alert.target_price,
      savings: alert.target_price! - alert.course!.price,
      savings_percentage: ((alert.target_price! - alert.course!.price) / alert.course!.price) * 100,
    }));
  }

  async getWishlistAnalytics(studentId: string): Promise<any> {
    const analytics = await this.wishlistRepository
      .createQueryBuilder('wishlist')
      .leftJoin('wishlist.course', 'course')
      .leftJoin('course.courseCategories', 'courseCategory')
      .leftJoin('courseCategory.category', 'category')
      .select([
        'category.name as category_name',
        'COUNT(wishlist.id) as wishlist_count',
        'AVG(course.price) as avg_price',
        'AVG(wishlist.priority) as avg_priority',
      ])
      .where('wishlist.student_id = :studentId', { studentId })
      .groupBy('category.name')
      .orderBy('wishlist_count', 'DESC')
      .getRawMany();

    const monthlyTrends = await this.wishlistRepository
      .createQueryBuilder('wishlist')
      .select([
        'DATE_TRUNC(\'month\', wishlist.created_at) as month',
        'COUNT(wishlist.id) as items_added',
      ])
      .where('wishlist.student_id = :studentId', { studentId })
      .andWhere('wishlist.created_at >= NOW() - INTERVAL \'12 months\'')
      .groupBy('DATE_TRUNC(\'month\', wishlist.created_at)')
      .orderBy('month', 'ASC')
      .getRawMany();

    return {
      category_analytics: analytics,
      monthly_trends: monthlyTrends,
      generated_at: new Date().toISOString(),
    };
  }

  async moveToWishlistList(wishlistId: string, newListName: string, studentId: string): Promise<Wishlist> {
    const wishlistItem = await this.wishlistRepository.findOne({
      where: {
        id: wishlistId,
        student_id: studentId,
      },
    });

    if (!wishlistItem) {
      throw new NotFoundException('Wishlist item not found');
    }

    wishlistItem.list_name = newListName;
    return this.wishlistRepository.save(wishlistItem);
  }

  async duplicateWishlistItem(wishlistId: string, newListName: string, studentId: string): Promise<Wishlist> {
    const originalItem = await this.wishlistRepository.findOne({
      where: {
        id: wishlistId,
        student_id: studentId,
      },
    });

    if (!originalItem) {
      throw new NotFoundException('Wishlist item not found');
    }

    const duplicateItem = this.wishlistRepository.create({
      student_id: studentId,
      course_id: originalItem.course_id,
      list_name: newListName,
      priority: originalItem.priority,
      is_notification_enabled: originalItem.is_notification_enabled,
      target_price: originalItem.target_price,
      target_date: originalItem.target_date,
      metadata: originalItem.metadata,
    });

    return this.wishlistRepository.save(duplicateItem);
  }
}