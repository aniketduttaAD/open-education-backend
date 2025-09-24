import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { AdminActivity, SystemConfig } from "../entities";
import {
  CreateSystemConfigDto,
  UpdateSystemConfigDto,
  BulkUserActionDto,
  BulkCourseActionDto,
} from "../dto";
import { User } from "../../auth/entities/user.entity";
import { Course } from "../../courses/entities/course.entity";
import { CourseEnrollment } from "../../courses/entities/course-enrollment.entity";
import { File } from "../../storage/entities/file.entity";
import { QueueService } from "../../queue/services/queue.service";
import { StorageService } from "../../storage/services/storage.service";

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(AdminActivity)
    private adminActivityRepository: Repository<AdminActivity>,
    @InjectRepository(SystemConfig)
    private systemConfigRepository: Repository<SystemConfig>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Course)
    private courseRepository: Repository<Course>,
    @InjectRepository(CourseEnrollment)
    private enrollmentRepository: Repository<CourseEnrollment>,
    @InjectRepository(File)
    private fileRepository: Repository<File>,
    private readonly queueService: QueueService,
    private readonly storageService: StorageService
  ) {}

  async createSystemConfig(
    createDto: CreateSystemConfigDto,
    adminId: string
  ): Promise<SystemConfig> {
    // Check if config already exists
    const existingConfig = await this.systemConfigRepository.findOne({
      where: { key: createDto.key },
    });

    if (existingConfig) {
      throw new BadRequestException("Configuration key already exists");
    }

    const config = this.systemConfigRepository.create(createDto);
    const savedConfig = await this.systemConfigRepository.save(config);

    // Log admin activity
    await this.logAdminActivity(
      adminId,
      "system_config_updated",
      `Created system config: ${createDto.key}`,
      {
        new_values: createDto,
      }
    );

    return savedConfig;
  }

  async updateSystemConfig(
    configId: string,
    updateDto: UpdateSystemConfigDto,
    adminId: string
  ): Promise<SystemConfig> {
    const config = await this.systemConfigRepository.findOne({
      where: { id: configId },
    });

    if (!config) {
      throw new NotFoundException("System configuration not found");
    }

    const oldValues = { ...config };
    Object.assign(config, updateDto);
    const savedConfig = await this.systemConfigRepository.save(config);

    // Log admin activity
    await this.logAdminActivity(
      adminId,
      "system_config_updated",
      `Updated system config: ${config.key}`,
      {
        old_values: oldValues,
        new_values: updateDto,
      }
    );

    return savedConfig;
  }

  async getSystemConfigs(category?: string): Promise<SystemConfig[]> {
    const queryBuilder =
      this.systemConfigRepository.createQueryBuilder("config");

    if (category) {
      queryBuilder.where("config.category = :category", { category });
    }

    return queryBuilder
      .orderBy("config.category", "ASC")
      .addOrderBy("config.key", "ASC")
      .getMany();
  }

  async getSystemConfig(key: string): Promise<SystemConfig> {
    const config = await this.systemConfigRepository.findOne({
      where: { key },
    });

    if (!config) {
      throw new NotFoundException("System configuration not found");
    }

    return config;
  }

  async deleteSystemConfig(configId: string, adminId: string): Promise<void> {
    const config = await this.systemConfigRepository.findOne({
      where: { id: configId },
    });

    if (!config) {
      throw new NotFoundException("System configuration not found");
    }

    if (config.is_required) {
      throw new BadRequestException("Cannot delete required configuration");
    }

    await this.systemConfigRepository.remove(config);

    // Log admin activity
    await this.logAdminActivity(
      adminId,
      "system_config_updated",
      `Deleted system config: ${config.key}`,
      {
        old_values: config,
      }
    );
  }

  async getSystemStats(): Promise<any> {
    const [
      totalUsers,
      totalTutors,
      totalStudents,
      totalCourses,
      totalEnrollments,
      // totalRevenue, // Temporarily commented out due to Payment dependency
    ] = await Promise.all([
      this.userRepository.count(),
      this.userRepository.count({ where: { user_type: "tutor" } }),
      this.userRepository.count({ where: { user_type: "student" } }),
      this.courseRepository.count(),
      this.enrollmentRepository.count(),
      // this.paymentRepository // Temporarily commented out due to Payment dependency
      //   .createQueryBuilder('payment')
      //   .select('SUM(payment.amount)', 'total')
      //   .where('payment.status = :status', { status: 'paid' })
      //   .getRawOne(),
    ]);

    const totalRevenue = { total: 0 }; // Temporary placeholder

    // Get monthly stats
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [activeUsersThisMonth, newUsersThisMonth, newCoursesThisMonth] =
      await Promise.all([
        this.userRepository
          .createQueryBuilder("user")
          .where("user.updated_at >= :startOfMonth", { startOfMonth })
          .getCount(),
        this.userRepository
          .createQueryBuilder("user")
          .where("user.created_at >= :startOfMonth", { startOfMonth })
          .getCount(),
        this.courseRepository
          .createQueryBuilder("course")
          .where("course.created_at >= :startOfMonth", { startOfMonth })
          .getCount(),
      ]);

    return {
      total_users: totalUsers,
      total_tutors: totalTutors,
      total_students: totalStudents,
      total_courses: totalCourses,
      total_enrollments: totalEnrollments,
      total_revenue: Number(totalRevenue?.total ?? 0),
      active_users_this_month: activeUsersThisMonth,
      new_users_this_month: newUsersThisMonth,
      new_courses_this_month: newCoursesThisMonth,
      generated_at: new Date().toISOString(),
    };
  }

  async performBulkUserAction(
    bulkActionDto: BulkUserActionDto,
    adminId: string
  ): Promise<any> {
    const { user_ids, action, reason } = bulkActionDto;
    const results = [];

    for (const userId of user_ids) {
      try {
        const user = await this.userRepository.findOne({
          where: { id: userId },
        });

        if (!user) {
          results.push({
            user_id: userId,
            status: "not_found",
            error: "User not found",
          });
          continue;
        }

        let updatedUser;
        switch (action) {
          case "suspend":
            // Mark user as suspended using existing user fields
            updatedUser = await this.userRepository.save({
              ...user,
              onboarding_complete: false, // Using existing field to mark suspended
            });
            break;
          case "activate":
            updatedUser = await this.userRepository.save({
              ...user,
              onboarding_complete: true,
            });
            break;
          case "delete":
            await this.userRepository.remove(user);
            updatedUser = null;
            break;
          case "export_data":
            // Export user data (implementation depends on requirements)
            updatedUser = user;
            break;
        }

        results.push({ user_id: userId, status: "success", action });

        // Log admin activity
        await this.logAdminActivity(
          adminId,
          "user_updated",
          `Bulk ${action} user: ${user.email}`,
          {
            target_user_id: userId,
            action,
            reason,
          }
        );
      } catch (error) {
        results.push({
          user_id: userId,
          status: "error",
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return {
      action,
      total_processed: user_ids.length,
      successful: results.filter((r) => r.status === "success").length,
      failed: results.filter((r) => r.status === "error").length,
      not_found: results.filter((r) => r.status === "not_found").length,
      results,
    };
  }

  async performBulkCourseAction(
    bulkActionDto: BulkCourseActionDto,
    adminId: string
  ): Promise<any> {
    const { course_ids, action, reason } = bulkActionDto;
    const results = [];

    for (const courseId of course_ids) {
      try {
        const course = await this.courseRepository.findOne({
          where: { id: courseId },
        });

        if (!course) {
          results.push({
            course_id: courseId,
            status: "not_found",
            error: "Course not found",
          });
          continue;
        }

        let updatedCourse;
        switch (action) {
          case "approve":
            updatedCourse = await this.courseRepository.save({
              ...course,
              status: "published",
              approved_at: new Date(),
            });
            break;
          case "reject":
            course.status = "rejected" as any;
            (course as any).rejected_at = new Date();
            updatedCourse = await this.courseRepository.save(course);
            break;
          case "delete":
            await this.courseRepository.remove(course);
            updatedCourse = null;
            break;
          case "feature":
            updatedCourse = await this.courseRepository.save({
              ...course,
              is_featured: true,
            });
            break;
          case "unfeature":
            updatedCourse = await this.courseRepository.save({
              ...course,
              is_featured: false,
            });
            break;
        }

        results.push({ course_id: courseId, status: "success", action });

        // Log admin activity
        await this.logAdminActivity(
          adminId,
          "course_updated",
          `Bulk ${action} course: ${course.title}`,
          {
            target_course_id: courseId,
            action,
            reason,
          }
        );
      } catch (error) {
        results.push({
          course_id: courseId,
          status: "error",
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return {
      action,
      total_processed: course_ids.length,
      successful: results.filter((r) => r.status === "success").length,
      failed: results.filter((r) => r.status === "error").length,
      not_found: results.filter((r) => r.status === "not_found").length,
      results,
    };
  }

  async getAdminActivities(
    page: number = 1,
    limit: number = 10,
    adminId?: string
  ): Promise<{ activities: AdminActivity[]; total: number }> {
    const queryBuilder = this.adminActivityRepository
      .createQueryBuilder("activity")
      .leftJoinAndSelect("activity.admin", "admin")
      .leftJoinAndSelect("activity.target_user", "target_user")
      .orderBy("activity.created_at", "DESC");

    if (adminId) {
      queryBuilder.where("activity.admin_id = :adminId", { adminId });
    }

    const [activities, total] = await queryBuilder
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { activities, total };
  }

  async getUserAnalytics(): Promise<any> {
    const userStats = await this.userRepository
      .createQueryBuilder("user")
      .select([
        "user.user_type",
        "COUNT(*) as count",
        "AVG(EXTRACT(EPOCH FROM (NOW() - user.created_at))/86400) as avg_days_since_registration",
      ])
      .groupBy("user.user_type")
      .getRawMany();

    const monthlyUserGrowth = await this.userRepository
      .createQueryBuilder("user")
      .select([
        "DATE_TRUNC('month', user.created_at) as month",
        "COUNT(*) as new_users",
      ])
      .where("user.created_at >= NOW() - INTERVAL '12 months'")
      .groupBy("DATE_TRUNC('month', user.created_at)")
      .orderBy("month", "ASC")
      .getRawMany();

    return {
      user_stats: userStats,
      monthly_growth: monthlyUserGrowth,
      generated_at: new Date().toISOString(),
    };
  }

  async getCourseAnalytics(): Promise<any> {
    const courseStats = await this.courseRepository
      .createQueryBuilder("course")
      .select([
        "course.status",
        "COUNT(*) as count",
        "AVG(course.price) as avg_price",
        "AVG(course.rating) as avg_rating",
      ])
      .groupBy("course.status")
      .getRawMany();

    const topCourses = await this.courseRepository
      .createQueryBuilder("course")
      .leftJoin("course.enrollments", "enrollment")
      .select([
        "course.id",
        "course.title",
        "course.price",
        "course.rating",
        "COUNT(enrollment.id) as enrollment_count",
      ])
      .groupBy("course.id, course.title, course.price, course.rating")
      .orderBy("enrollment_count", "DESC")
      .limit(10)
      .getRawMany();

    return {
      course_stats: courseStats,
      top_courses: topCourses,
      generated_at: new Date().toISOString(),
    };
  }

  private async logAdminActivity(
    adminId: string,
    action: string,
    description: string,
    metadata?: any,
    targetUserId?: string,
    targetCourseId?: string,
    targetPaymentId?: string
  ): Promise<void> {
    const activity = this.adminActivityRepository.create({
      admin_id: adminId,
      action: action as any,
      description,
      target_user_id: targetUserId,
      target_course_id: targetCourseId,
      target_payment_id: targetPaymentId,
      metadata,
    });

    await this.adminActivityRepository.save(activity);
  }

  /**
   * Get tutors pending verification
   */
  async getPendingTutors(
    page: number = 1,
    limit: number = 10
  ): Promise<{
    tutors: any[];
    total: number;
  }> {
    const queryBuilder = this.userRepository
      .createQueryBuilder("user")
      .where("user.user_type = :userType", { userType: "tutor" })
      .andWhere("user.tutor_details IS NOT NULL")
      .andWhere("user.tutor_details->>'register_fees_paid' = 'true'")
      .andWhere("user.tutor_details->>'verification_status' = 'pending'")
      .skip((page - 1) * limit)
      .take(limit)
      .orderBy("user.created_at", "DESC");

    const [tutors, total] = await queryBuilder.getManyAndCount();

    return {
      tutors: tutors.map((tutor) => ({
        id: tutor.id,
        user_id: tutor.id,
        name: tutor.name,
        email: tutor.email,
        bio: tutor.bio,
        tutor_details: tutor.tutor_details,
        created_at: tutor.created_at,
        updated_at: tutor.updated_at,
      })),
      total,
    };
  }

  /**
   * Verify or reject tutor
   */
  async verifyTutor(
    tutorId: string,
    verificationData: { status: "verified" | "rejected"; reason?: string },
    adminId: string
  ): Promise<any> {
    const user = await this.userRepository.findOne({
      where: { id: tutorId, user_type: "tutor" },
    });

    if (!user || !user.tutor_details) {
      throw new NotFoundException("Tutor not found");
    }

    // Update tutor verification status
    user.tutor_details.verification_status = verificationData.status;
    await this.userRepository.save(user);

    // Log admin activity
    await this.logAdminActivity(
      adminId,
      "tutor_verification",
      `Tutor ${verificationData.status}: ${user.email}`,
      {
        target_user_id: tutorId,
        verification_status: verificationData.status,
        reason: verificationData.reason,
      }
    );

    return {
      tutor_id: tutorId,
      status: verificationData.status,
      verified_at: new Date(),
      verified_by: adminId,
    };
  }

  /**
   * Get tutor verification documents
   */
  async getTutorDocuments(tutorId: string): Promise<any[]> {
    const user = await this.userRepository.findOne({
      where: { id: tutorId, user_type: "tutor" },
    });

    if (!user) {
      throw new NotFoundException("Tutor not found");
    }

    // Get documents uploaded by the tutor
    const documents = await this.fileRepository.find({
      where: {
        user_id: tutorId,
        file_type: "document",
      },
      order: { created_at: "DESC" },
    });

    return documents.map((doc) => ({
      id: doc.id,
      file_name: doc.file_name,
      original_name: doc.original_name,
      file_type: doc.file_type,
      file_size: doc.file_size,
      file_url: doc.file_url,
      created_at: doc.created_at,
    }));
  }

  /**
   * Get a download URL for a tutor's verification document (admin access)
   */
  async getTutorDocumentUrl(
    tutorId: string,
    documentId: string
  ): Promise<string> {
    const document = await this.fileRepository.findOne({
      where: { id: documentId, user_id: tutorId, file_type: "document" },
    });
    if (!document) {
      throw new NotFoundException("Document not found");
    }
    // Always produce a download URL (presigned if private)
    return await this.storageService.getFileDownloadUrl(documentId, tutorId);
  }
}
