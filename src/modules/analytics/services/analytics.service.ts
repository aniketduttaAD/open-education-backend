import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { LearningAnalytics, CourseAnalytics } from '../entities';
import { WebSocketGateway } from '../../websocket/websocket.gateway';
import { Course } from '../../courses/entities/course.entity';
import { CourseEnrollment } from '../../courses/entities/course-enrollment.entity';
import { CourseReview } from '../../courses/entities/course-review.entity';
import { User } from '../../auth/entities/user.entity';

/**
 * Analytics service for learning insights and performance tracking
 */
@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    @InjectRepository(LearningAnalytics)
    private learningAnalyticsRepository: Repository<LearningAnalytics>,
    @InjectRepository(CourseAnalytics)
    private courseAnalyticsRepository: Repository<CourseAnalytics>,
    @InjectRepository(Course)
    private courseRepository: Repository<Course>,
    @InjectRepository(CourseEnrollment)
    private enrollmentRepository: Repository<CourseEnrollment>,
    @InjectRepository(CourseReview)
    private reviewRepository: Repository<CourseReview>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private webSocketGateway: WebSocketGateway,
  ) {}

  /**
   * Get student learning analytics
   */
  async getStudentAnalytics(
    userId: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<{
    overview: {
      totalTimeSpent: number;
      totalVideosWatched: number;
      totalQuizzesCompleted: number;
      averageQuizScore: number;
      totalTokensUsed: number;
      averageProgress: number;
    };
    dailyData: LearningAnalytics[];
    trends: {
      timeSpentTrend: number;
      quizScoreTrend: number;
      progressTrend: number;
    };
    insights: string[];
  }> {
    this.logger.log(`Getting analytics for student: ${userId}`);

    try {
      const dateFilter = this.buildDateFilter(startDate, endDate);
      
      const dailyData = await this.learningAnalyticsRepository.find({
        where: {
          user_id: userId,
          ...dateFilter,
        },
        order: { date: 'ASC' },
      });

      // Calculate overview
      const overview = this.calculateOverview(dailyData);

      // Calculate trends
      const trends = this.calculateTrends(dailyData);

      // Generate insights
      const insights = this.generateInsights(overview, trends, dailyData);

      return {
        overview,
        dailyData,
        trends,
        insights,
      };
    } catch (error) {
      this.logger.error(`Failed to get student analytics for user ${userId}:`, error);
      throw new BadRequestException('Failed to get student analytics');
    }
  }

  /**
   * Get course analytics
   */
  async getCourseAnalytics(
    courseId: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<{
    overview: {
      totalEnrollments: number;
      activeStudents: number;
      completionRate: number;
      averageRating: number;
      totalRevenue: number;
      totalVideoViews: number;
    };
    dailyData: CourseAnalytics[];
    trends: {
      enrollmentTrend: number;
      completionTrend: number;
      ratingTrend: number;
    };
    insights: string[];
  }> {
    this.logger.log(`Getting analytics for course: ${courseId}`);

    try {
      const dateFilter = this.buildDateFilter(startDate, endDate);
      
      const dailyData = await this.courseAnalyticsRepository.find({
        where: {
          course_id: courseId,
          ...dateFilter,
        },
        order: { date: 'ASC' },
      });

      // Calculate overview
      const overview = this.calculateCourseOverview(dailyData);

      // Calculate trends
      const trends = this.calculateCourseTrends(dailyData);

      // Generate insights
      const insights = this.generateCourseInsights(overview, trends, dailyData);

      return {
        overview,
        dailyData,
        trends,
        insights,
      };
    } catch (error) {
      this.logger.error(`Failed to get course analytics for course ${courseId}:`, error);
      throw new BadRequestException('Failed to get course analytics');
    }
  }

  /**
   * Get tutor analytics
   */
  async getTutorAnalytics(
    tutorId: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<{
    overview: {
      totalCourses: number;
      totalStudents: number;
      totalRevenue: number;
      averageRating: number;
      totalEarnings: number;
    };
    coursePerformance: Array<{
      courseId: string;
      courseTitle: string;
      enrollments: number;
      completionRate: number;
      rating: number;
      revenue: number;
    }>;
    trends: {
      revenueTrend: number;
      studentTrend: number;
      ratingTrend: number;
    };
    insights: string[];
  }> {
    this.logger.log(`Getting analytics for tutor: ${tutorId}`);

    try {
      // Get real data from repositories
      const [
        totalCourses,
        totalStudents,
        totalEnrollments,
        averageRating,
        totalRevenue,
        coursePerformance,
        recentEnrollments,
        recentReviews,
      ] = await Promise.all([
        this.courseRepository.count({ where: { status: 'published' } }),
        this.userRepository.count({ where: { user_type: 'student' } }),
        this.enrollmentRepository.count(),
        this.courseRepository
          .createQueryBuilder('course')
          .select('AVG(course.rating)', 'avg')
          .where('course.status = :status', { status: 'published' })
          .getRawOne(),
        this.courseRepository
          .createQueryBuilder('course')
          .select('SUM(course.price * course.enrollment_count)', 'total')
          .where('course.status = :status', { status: 'published' })
          .getRawOne(),
        this.courseRepository.find({
          where: { status: 'published' },
          order: { enrollment_count: 'DESC' },
          take: 10,
        }),
        this.enrollmentRepository.find({
          where: { status: 'active' },
          order: { created_at: 'DESC' },
          take: 10,
          relations: ['course', 'student'],
        }),
        this.reviewRepository.find({
          order: { created_at: 'DESC' },
          take: 10,
          relations: ['course', 'student'],
        }),
      ]);

      // Calculate trends (comparing last 30 days with previous 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const sixtyDaysAgo = new Date();
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

      const [recentEnrollmentsCount, previousEnrollmentsCount] = await Promise.all([
        this.enrollmentRepository.count({
          where: { created_at: Between(thirtyDaysAgo, new Date()) },
        }),
        this.enrollmentRepository.count({
          where: { created_at: Between(sixtyDaysAgo, thirtyDaysAgo) },
        }),
      ]);

      const studentTrend = previousEnrollmentsCount > 0 
        ? ((recentEnrollmentsCount - previousEnrollmentsCount) / previousEnrollmentsCount) * 100 
        : 0;

      // Generate insights
      const insights = [];
      if (totalCourses > 0) {
        insights.push(`You have ${totalCourses} published courses`);
      }
      if (totalStudents > 0) {
        insights.push(`Total of ${totalStudents} students on the platform`);
      }
      if (averageRating.avg > 0) {
        insights.push(`Average course rating: ${parseFloat(averageRating.avg).toFixed(1)}/5`);
      }
      if (recentEnrollments.length > 0) {
        insights.push(`${recentEnrollments.length} new enrollments in the last 10 activities`);
      }

      return {
        overview: {
          totalCourses,
          totalStudents,
          totalRevenue: parseFloat(totalRevenue.total || '0'),
          averageRating: parseFloat(averageRating.avg || '0'),
          totalEarnings: parseFloat(totalRevenue.total || '0') * 0.8, // 80% to tutors
        },
        coursePerformance: coursePerformance.map(course => ({
          courseId: course.id,
          courseTitle: course.title,
          enrollments: course.enrollment_count,
          completionRate: 0, // Would need to calculate from enrollment data
          rating: course.rating,
          revenue: course.price * course.enrollment_count,
        })),
        trends: {
          revenueTrend: 0, // Would need payment data to calculate
          studentTrend,
          ratingTrend: 0, // Would need historical rating data
        },
        insights,
      };
    } catch (error) {
      this.logger.error(`Failed to get tutor analytics for tutor ${tutorId}:`, error);
      throw new BadRequestException('Failed to get tutor analytics');
    }
  }

  /**
   * Record learning activity
   */
  async recordLearningActivity(
    userId: string,
    activity: {
      courseId?: string;
      topicId?: string;
      timeSpentMinutes?: number;
      videosWatched?: number;
      quizzesCompleted?: number;
      quizScore?: number;
      aiBuddyInteractions?: number;
      tokensUsed?: number;
      progressPercentage?: number;
    },
  ): Promise<void> {
    this.logger.log(`Recording learning activity for user: ${userId}`);

    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      let analytics = await this.learningAnalyticsRepository.findOne({
        where: {
          user_id: userId,
          course_id: activity.courseId,
          topic_id: activity.topicId,
          date: today,
        },
      });

      if (!analytics) {
        analytics = this.learningAnalyticsRepository.create({
          user_id: userId,
          course_id: activity.courseId,
          topic_id: activity.topicId,
          date: today,
        });
      }

      // Update metrics
      if (activity.timeSpentMinutes) {
        analytics.time_spent_minutes += activity.timeSpentMinutes;
      }
      if (activity.videosWatched) {
        analytics.videos_watched += activity.videosWatched;
      }
      if (activity.quizzesCompleted) {
        analytics.quizzes_completed += activity.quizzesCompleted;
      }
      if (activity.quizScore !== undefined) {
        // Update average quiz score
        const totalQuizzes = analytics.quizzes_completed;
        const currentAverage = analytics.average_quiz_score;
        analytics.average_quiz_score = ((currentAverage * totalQuizzes) + activity.quizScore) / (totalQuizzes + 1);
      }
      if (activity.aiBuddyInteractions) {
        analytics.ai_buddy_interactions += activity.aiBuddyInteractions;
      }
      if (activity.tokensUsed) {
        analytics.tokens_used += activity.tokensUsed;
      }
      if (activity.progressPercentage !== undefined) {
        analytics.progress_percentage = activity.progressPercentage;
      }

      await this.learningAnalyticsRepository.save(analytics);

      // Emit real-time analytics update
      this.webSocketGateway.emitToUser(userId, 'analytics:update', {
        type: 'learning',
        data: {
          timeSpent: analytics.time_spent_minutes,
          videosWatched: analytics.videos_watched,
          quizzesCompleted: analytics.quizzes_completed,
          averageQuizScore: analytics.average_quiz_score,
          progressPercentage: analytics.progress_percentage,
        },
        timestamp: new Date().toISOString(),
      });

    } catch (error) {
      this.logger.error(`Failed to record learning activity for user ${userId}:`, error);
      throw new BadRequestException('Failed to record learning activity');
    }
  }

  /**
   * Record course activity
   */
  async recordCourseActivity(
    courseId: string,
    activity: {
      newEnrollments?: number;
      activeStudents?: number;
      completionRate?: number;
      rating?: number;
      revenue?: number;
      videoViews?: number;
      quizAttempts?: number;
      averageQuizScore?: number;
    },
  ): Promise<void> {
    this.logger.log(`Recording course activity for course: ${courseId}`);

    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      let analytics = await this.courseAnalyticsRepository.findOne({
        where: {
          course_id: courseId,
          date: today,
        },
      });

      if (!analytics) {
        analytics = this.courseAnalyticsRepository.create({
          course_id: courseId,
          date: today,
        });
      }

      // Update metrics
      if (activity.newEnrollments) {
        analytics.new_enrollments += activity.newEnrollments;
        analytics.enrollment_count += activity.newEnrollments;
      }
      if (activity.activeStudents !== undefined) {
        analytics.active_students = activity.activeStudents;
      }
      if (activity.completionRate !== undefined) {
        analytics.completion_rate = activity.completionRate;
      }
      if (activity.rating !== undefined) {
        analytics.rating = activity.rating;
      }
      if (activity.revenue) {
        analytics.total_revenue += activity.revenue;
      }
      if (activity.videoViews) {
        analytics.video_views += activity.videoViews;
      }
      if (activity.quizAttempts) {
        analytics.quiz_attempts += activity.quizAttempts;
      }
      if (activity.averageQuizScore !== undefined) {
        analytics.average_quiz_score = activity.averageQuizScore;
      }

      await this.courseAnalyticsRepository.save(analytics);

      // Emit real-time analytics update
      this.webSocketGateway.emitToRoom(`analytics:course:${courseId}`, 'analytics:update', {
        type: 'course',
        courseId,
        data: {
          totalEnrollments: analytics.enrollment_count,
          activeStudents: analytics.active_students,
          completionRate: analytics.completion_rate,
          averageRating: analytics.rating,
          totalRevenue: analytics.total_revenue,
        },
        timestamp: new Date().toISOString(),
      });

    } catch (error) {
      this.logger.error(`Failed to record course activity for course ${courseId}:`, error);
      throw new BadRequestException('Failed to record course activity');
    }
  }

  // Private helper methods
  private buildDateFilter(startDate?: Date, endDate?: Date) {
    if (startDate && endDate) {
      return {
        date: Between(startDate, endDate),
      };
    }
    return {};
  }

  private calculateOverview(dailyData: LearningAnalytics[]) {
    return {
      totalTimeSpent: dailyData.reduce((sum, data) => sum + data.time_spent_minutes, 0),
      totalVideosWatched: dailyData.reduce((sum, data) => sum + data.videos_watched, 0),
      totalQuizzesCompleted: dailyData.reduce((sum, data) => sum + data.quizzes_completed, 0),
      averageQuizScore: this.calculateAverage(dailyData.map(data => data.average_quiz_score)),
      totalTokensUsed: dailyData.reduce((sum, data) => sum + data.tokens_used, 0),
      averageProgress: this.calculateAverage(dailyData.map(data => data.progress_percentage)),
    };
  }

  private calculateCourseOverview(dailyData: CourseAnalytics[]) {
    const latest = dailyData[dailyData.length - 1];
    return {
      totalEnrollments: latest?.enrollment_count || 0,
      activeStudents: latest?.active_students || 0,
      completionRate: latest?.completion_rate || 0,
      averageRating: latest?.rating || 0,
      totalRevenue: latest?.total_revenue || 0,
      totalVideoViews: dailyData.reduce((sum, data) => sum + data.video_views, 0),
    };
  }

  private calculateTrends(dailyData: LearningAnalytics[]) {
    if (dailyData.length < 2) {
      return { timeSpentTrend: 0, quizScoreTrend: 0, progressTrend: 0 };
    }

    const first = dailyData[0];
    const last = dailyData[dailyData.length - 1];

    return {
      timeSpentTrend: this.calculateTrend(first.time_spent_minutes, last.time_spent_minutes),
      quizScoreTrend: this.calculateTrend(first.average_quiz_score, last.average_quiz_score),
      progressTrend: this.calculateTrend(first.progress_percentage, last.progress_percentage),
    };
  }

  private calculateCourseTrends(dailyData: CourseAnalytics[]) {
    if (dailyData.length < 2) {
      return { enrollmentTrend: 0, completionTrend: 0, ratingTrend: 0 };
    }

    const first = dailyData[0];
    const last = dailyData[dailyData.length - 1];

    return {
      enrollmentTrend: this.calculateTrend(first.enrollment_count, last.enrollment_count),
      completionTrend: this.calculateTrend(first.completion_rate, last.completion_rate),
      ratingTrend: this.calculateTrend(first.rating, last.rating),
    };
  }

  private calculateTrend(first: number, last: number): number {
    if (first === 0) return last > 0 ? 100 : 0;
    return ((last - first) / first) * 100;
  }

  private calculateAverage(values: number[]): number {
    const validValues = values.filter(v => v > 0);
    if (validValues.length === 0) return 0;
    return validValues.reduce((sum, val) => sum + val, 0) / validValues.length;
  }

  private generateInsights(overview: any, trends: any, dailyData: LearningAnalytics[]): string[] {
    const insights: string[] = [];

    if (trends.timeSpentTrend > 20) {
      insights.push('Great job! You\'ve increased your study time significantly.');
    }

    if (trends.quizScoreTrend > 10) {
      insights.push('Your quiz performance is improving! Keep up the good work.');
    }

    if (overview.averageProgress > 80) {
      insights.push('You\'re making excellent progress through your courses.');
    }

    if (overview.totalTokensUsed > 500) {
      insights.push('You\'re actively using the AI Buddy feature. Great engagement!');
    }

    return insights;
  }

  private generateCourseInsights(overview: any, trends: any, dailyData: CourseAnalytics[]): string[] {
    const insights: string[] = [];

    if (trends.enrollmentTrend > 20) {
      insights.push('Course enrollment is growing steadily.');
    }

    if (overview.completionRate > 80) {
      insights.push('Students are completing this course at a high rate.');
    }

    if (overview.averageRating > 4.5) {
      insights.push('Students are highly satisfied with this course.');
    }

    return insights;
  }
}
