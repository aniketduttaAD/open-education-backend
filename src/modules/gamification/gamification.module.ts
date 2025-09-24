import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GamificationController } from './gamification.controller';
import { GamificationService } from './services/gamification.service';
import { AchievementDefinition } from './entities';
import { StudentAchievement, StudentLoginStreak } from '../users/entities';
import { WebSocketModule } from '../websocket/websocket.module';
import { Course } from '../courses/entities/course.entity';
import { CourseEnrollment } from '../courses/entities/course-enrollment.entity';
import { User } from '../auth/entities/user.entity';

/**
 * Gamification module for achievements, streaks, and leaderboards
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      AchievementDefinition,
      StudentAchievement,
      StudentLoginStreak,
      Course,
      CourseEnrollment,
      User,
    ]),
    WebSocketModule,
  ],
  controllers: [GamificationController],
  providers: [GamificationService],
  exports: [GamificationService],
})
export class GamificationModule {}
