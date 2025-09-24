import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AchievementDefinition } from '../entities';
import { StudentAchievement, StudentLoginStreak, AchievementType, AchievementRarity } from '../../users/entities';
import { WebSocketGateway } from '../../websocket/websocket.gateway';
import { Course } from '../../courses/entities/course.entity';
import { CourseEnrollment } from '../../courses/entities/course-enrollment.entity';
import { User } from '../../auth/entities/user.entity';

/**
 * Gamification service for achievements, streaks, and leaderboards
 */
@Injectable()
export class GamificationService {
  private readonly logger = new Logger(GamificationService.name);

  constructor(
    @InjectRepository(AchievementDefinition)
    private achievementDefinitionRepository: Repository<AchievementDefinition>,
    @InjectRepository(StudentAchievement)
    private studentAchievementRepository: Repository<StudentAchievement>,
    @InjectRepository(StudentLoginStreak)
    private studentLoginStreakRepository: Repository<StudentLoginStreak>,
    @InjectRepository(Course)
    private courseRepository: Repository<Course>,
    @InjectRepository(CourseEnrollment)
    private enrollmentRepository: Repository<CourseEnrollment>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private webSocketGateway: WebSocketGateway,
  ) {}

  /**
   * Get user achievements
   */
  async getUserAchievements(userId: string): Promise<{
    achievements: StudentAchievement[];
    totalPoints: number;
    achievementCount: number;
  }> {
    this.logger.log(`Getting achievements for user: ${userId}`);

    const achievements = await this.studentAchievementRepository.find({
      where: { user_id: userId },
      order: { earned_at: 'DESC' },
    });

    const totalPoints = achievements.reduce((sum, achievement) => {
      return sum + achievement.points_earned;
    }, 0);

    return {
      achievements,
      totalPoints,
      achievementCount: achievements.length,
    };
  }

  /**
   * Get user streaks
   */
  async getUserStreaks(userId: string): Promise<{
    loginStreak: number;
    bestLoginStreak: number;
    lastLoginDate: Date | null;
  }> {
    this.logger.log(`Getting streaks for user: ${userId}`);

    const loginStreak = await this.studentLoginStreakRepository.findOne({
      where: { user_id: userId },
    });

    return {
      loginStreak: loginStreak?.current_streak || 0,
      bestLoginStreak: loginStreak?.best_streak || 0,
      lastLoginDate: loginStreak?.last_login_date || null,
    };
  }

  /**
   * Award achievement to user
   */
  async awardAchievement(
    userId: string,
    achievementType: AchievementType,
    metadata?: Record<string, any>,
  ): Promise<StudentAchievement | null> {
    this.logger.log(`Awarding achievement ${achievementType} to user: ${userId}`);

    try {
      // Check if user already has this achievement
      const existingAchievement = await this.studentAchievementRepository.findOne({
        where: {
          user_id: userId,
          achievement_type: achievementType,
        },
      });

      if (existingAchievement) {
        this.logger.log(`User ${userId} already has achievement ${achievementType}`);
        return null;
      }

      // Get achievement definition
      const achievementDefinition = await this.achievementDefinitionRepository.findOne({
        where: { type: achievementType, is_active: true },
      });

      if (!achievementDefinition) {
        this.logger.warn(`Achievement definition not found for type: ${achievementType}`);
        return null;
      }

      // Create new achievement
      const achievement = this.studentAchievementRepository.create({
        user_id: userId,
        achievement_type: achievementType,
        rarity: achievementDefinition.rarity,
        title: achievementDefinition.name,
        description: achievementDefinition.description,
        points_earned: achievementDefinition.points,
        icon_url: achievementDefinition.icon_url,
        metadata: metadata || {},
        earned_at: new Date(),
      });

      const savedAchievement = await this.studentAchievementRepository.save(achievement);

      // Emit real-time achievement notification
      this.webSocketGateway.emitToUser(userId, 'achievement:unlocked', {
        achievementId: achievementDefinition.id,
        title: achievementDefinition.name,
        description: achievementDefinition.description,
        points: achievementDefinition.points,
        rarity: achievementDefinition.rarity,
        timestamp: new Date().toISOString(),
      });

      this.logger.log(`Achievement ${achievementType} awarded to user ${userId}`);
      return savedAchievement;
    } catch (error) {
      this.logger.error(`Failed to award achievement ${achievementType} to user ${userId}:`, error);
      throw new BadRequestException('Failed to award achievement');
    }
  }

  /**
   * Update login streak
   */
  async updateLoginStreak(userId: string): Promise<{
    currentStreak: number;
    bestStreak: number;
    isNewRecord: boolean;
  }> {
    this.logger.log(`Updating login streak for user: ${userId}`);

    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      let loginStreak = await this.studentLoginStreakRepository.findOne({
        where: { user_id: userId },
      });

      if (!loginStreak) {
        // Create new streak record
        loginStreak = this.studentLoginStreakRepository.create({
          user_id: userId,
          current_streak: 1,
          best_streak: 1,
          last_login_date: today,
        });
      } else {
        const lastLoginDate = new Date(loginStreak.last_login_date!);
        lastLoginDate.setHours(0, 0, 0, 0);

        const daysDifference = Math.floor((today.getTime() - lastLoginDate.getTime()) / (1000 * 60 * 60 * 24));

        if (daysDifference === 1) {
          // Consecutive day
          loginStreak.current_streak += 1;
        } else if (daysDifference > 1) {
          // Streak broken
          loginStreak.current_streak = 1;
        }
        // If daysDifference === 0, same day, don't update

        loginStreak.last_login_date = today;
        loginStreak.best_streak = Math.max(loginStreak.best_streak, loginStreak.current_streak);
      }

      const savedStreak = await this.studentLoginStreakRepository.save(loginStreak);

      // Check for streak achievements
      await this.checkStreakAchievements(userId, savedStreak.current_streak);

      // Emit real-time streak update
      this.webSocketGateway.emitToUser(userId, 'streak:update', {
        type: 'login',
        current: savedStreak.current_streak,
        best: savedStreak.best_streak,
        multiplier: this.getStreakMultiplier(savedStreak.current_streak),
        timestamp: new Date().toISOString(),
      });

      return {
        currentStreak: savedStreak.current_streak,
        bestStreak: savedStreak.best_streak,
        isNewRecord: savedStreak.current_streak === savedStreak.best_streak && savedStreak.current_streak > 1,
      };
    } catch (error) {
      this.logger.error(`Failed to update login streak for user ${userId}:`, error);
      throw new BadRequestException('Failed to update login streak');
    }
  }

  /**
   * Get leaderboards
   */
  async getLeaderboards(type: 'students' | 'tutors' | 'courses'): Promise<any[]> {
    this.logger.log(`Getting ${type} leaderboard`);

    try {
      switch (type) {
        case 'students':
          return this.getStudentLeaderboard();
        case 'tutors':
          return this.getTutorLeaderboard();
        case 'courses':
          return this.getCourseLeaderboard();
        default:
          throw new BadRequestException('Invalid leaderboard type');
      }
    } catch (error) {
      this.logger.error(`Failed to get ${type} leaderboard:`, error);
      throw new BadRequestException(`Failed to get ${type} leaderboard`);
    }
  }

  /**
   * Get student leaderboard based on achievements and points
   */
  private async getStudentLeaderboard(): Promise<any[]> {
    const query = `
      SELECT 
        sa.user_id,
        u.name,
        u.email,
        COUNT(sa.id) as achievement_count,
        COALESCE(SUM(sa.points_earned), 0) as total_points,
        MAX(sa.earned_at) as last_achievement_date
      FROM student_achievements sa
      JOIN users u ON sa.user_id = u.id
      GROUP BY sa.user_id, u.name, u.email
      ORDER BY total_points DESC, achievement_count DESC
      LIMIT 50
    `;

    return this.studentAchievementRepository.query(query);
  }

  /**
   * Get tutor leaderboard based on ratings and enrollments
   */
  private async getTutorLeaderboard(): Promise<any[]> {
    try {
      const tutors = await this.courseRepository
        .createQueryBuilder('course')
        .leftJoin('course.tutor', 'tutor')
        .where('course.status = :status', { status: 'published' })
        .select([
          'tutor.id',
          'tutor.name',
          'tutor.image',
        ])
        .addSelect('COUNT(course.id)', 'courseCount')
        .addSelect('SUM(course.enrollment_count)', 'totalEnrollments')
        .addSelect('AVG(course.rating)', 'averageRating')
        .addSelect('SUM(course.price * course.enrollment_count)', 'totalRevenue')
        .groupBy('tutor.id, tutor.name, tutor.image')
        .having('COUNT(course.id) > 0')
        .orderBy('totalEnrollments', 'DESC')
        .addOrderBy('averageRating', 'DESC')
        .limit(50)
        .getRawMany();

      return tutors.map((tutor, index) => ({
        rank: index + 1,
        tutorId: tutor.tutor_id,
        name: tutor.tutor_name || 'Anonymous',
        avatarUrl: tutor.tutor_image,
        courseCount: parseInt(tutor.courseCount) || 0,
        totalEnrollments: parseInt(tutor.totalEnrollments) || 0,
        averageRating: parseFloat(tutor.averageRating) || 0,
        totalRevenue: parseFloat(tutor.totalRevenue) || 0,
      }));
    } catch (error) {
      this.logger.error('Failed to get tutor leaderboard:', error);
      return [];
    }
  }

  /**
   * Get course leaderboard based on enrollments and ratings
   */
  private async getCourseLeaderboard(): Promise<any[]> {
    try {
      const courses = await this.courseRepository
        .createQueryBuilder('course')
        .leftJoin('course.tutor', 'tutor')
        .where('course.status = :status', { status: 'published' })
        .select([
          'course.id',
          'course.title',
          'course.thumbnail_url',
          'course.price',
          'course.enrollment_count',
          'course.rating',
          'course.review_count',
          'tutor.name',
        ])
        .orderBy('course.enrollment_count', 'DESC')
        .addOrderBy('course.rating', 'DESC')
        .limit(50)
        .getMany();

      return courses.map((course, index) => ({
        rank: index + 1,
        courseId: course.id,
        title: course.title,
        thumbnailUrl: course.thumbnail_url,
        tutorName: course.tutor?.name || 'Anonymous',
        price: course.price,
        enrollments: course.enrollment_count,
        rating: course.rating,
        totalRatings: course.review_count,
        revenue: course.price * course.enrollment_count,
      }));
    } catch (error) {
      this.logger.error('Failed to get course leaderboard:', error);
      return [];
    }
  }

  /**
   * Check for streak-based achievements
   */
  private async checkStreakAchievements(userId: string, currentStreak: number): Promise<void> {
    const streakMilestones = [7, 14, 30, 60, 100];

    for (const milestone of streakMilestones) {
      if (currentStreak === milestone) {
        await this.awardAchievement(userId, 'login_streak', {
          streak: currentStreak,
          milestone,
        });
      }
    }
  }

  /**
   * Get streak multiplier for rewards
   */
  private getStreakMultiplier(streak: number): number {
    if (streak >= 100) return 3.0;
    if (streak >= 30) return 2.5;
    if (streak >= 14) return 2.0;
    if (streak >= 7) return 1.5;
    return 1.0;
  }

  /**
   * Initialize default achievements
   */
  async initializeDefaultAchievements(): Promise<void> {
    this.logger.log('Initializing default achievements');

    const defaultAchievements = [
      {
        name: 'First Steps',
        description: 'Complete your first course',
        type: 'first_course' as AchievementType,
        rarity: 'common' as AchievementRarity,
        points: 100,
        icon_url: '/icons/first-steps.png',
        badge_color: '#4CAF50',
      },
      {
        name: 'Course Master',
        description: 'Complete 5 courses',
        type: 'course_completion' as AchievementType,
        rarity: 'rare' as AchievementRarity,
        points: 500,
        icon_url: '/icons/course-master.png',
        badge_color: '#2196F3',
        criteria: { count: 5 },
      },
      {
        name: 'Perfect Score',
        description: 'Get 100% on a quiz',
        type: 'perfect_score' as AchievementType,
        rarity: 'epic' as AchievementRarity,
        points: 300,
        icon_url: '/icons/perfect-score.png',
        badge_color: '#FF9800',
      },
      {
        name: 'Quiz Streak Master',
        description: 'Complete 10 quizzes in a row',
        type: 'quiz_streak' as AchievementType,
        rarity: 'legendary' as AchievementRarity,
        points: 1000,
        icon_url: '/icons/quiz-master.png',
        badge_color: '#9C27B0',
        criteria: { count: 10 },
      },
      {
        name: 'Login Legend',
        description: 'Login for 30 consecutive days',
        type: 'login_streak' as AchievementType,
        rarity: 'epic' as AchievementRarity,
        points: 750,
        icon_url: '/icons/login-legend.png',
        badge_color: '#FF5722',
        criteria: { days: 30 },
      },
    ];

    for (const achievement of defaultAchievements) {
      const existing = await this.achievementDefinitionRepository.findOne({
        where: { type: achievement.type },
      });

      if (!existing) {
        await this.achievementDefinitionRepository.save(achievement);
        this.logger.log(`Created default achievement: ${achievement.name}`);
      }
    }
  }
}
