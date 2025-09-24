import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './services/analytics.service';
import { LearningAnalytics, CourseAnalytics } from './entities';
import { WebSocketModule } from '../websocket/websocket.module';
import { Course } from '../courses/entities/course.entity';
import { CourseEnrollment } from '../courses/entities/course-enrollment.entity';
import { CourseReview } from '../courses/entities/course-review.entity';
import { User } from '../auth/entities/user.entity';

/**
 * Analytics module for learning insights and performance tracking
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      LearningAnalytics,
      CourseAnalytics,
      Course,
      CourseEnrollment,
      CourseReview,
      User,
    ]),
    WebSocketModule,
  ],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
