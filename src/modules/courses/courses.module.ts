import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CoursesController } from './courses.controller';
import { CoursesService } from './services/courses.service';
import { Course, CourseTopic, CourseSubtopic, CourseEnrollment, CourseReview, ReviewReply } from './entities';

/**
 * Courses module for managing course creation, topics, and enrollments
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Course,
      CourseTopic,
      CourseSubtopic,
      CourseEnrollment,
      CourseReview,
      ReviewReply,
    ]),
  ],
  controllers: [CoursesController],
  providers: [CoursesService],
  exports: [CoursesService],
})
export class CoursesModule {}
