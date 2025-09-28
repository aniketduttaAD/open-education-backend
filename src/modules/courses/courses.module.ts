import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CoursesController } from './courses.controller';
import { CoursesService } from './services/courses.service';
import { Course, CourseSection, CourseSubtopic, CourseEnrollment, CourseReview, ReviewReply } from './entities';
import { WebSocketModule } from '../websocket/websocket.module';

/**
 * Courses module for managing course creation, topics, and enrollments
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Course,
      CourseSection,
      CourseSubtopic,
      CourseEnrollment,
      CourseReview,
      ReviewReply,
    ]),
    forwardRef(() => WebSocketModule),
  ],
  controllers: [CoursesController],
  providers: [CoursesService],
  exports: [CoursesService],
})
export class CoursesModule {}
