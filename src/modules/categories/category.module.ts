import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CategoryController } from './category.controller';
import { CategoryService } from './services/category.service';
import { Category, CourseCategory, Recommendation } from './entities';
import { Course } from '../courses/entities/course.entity';
import { CourseEnrollment } from '../courses/entities/course-enrollment.entity';
import { VideoProgress } from '../progress/entities/video-progress.entity';

/**
 * Category module for category management and recommendations
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Category,
      CourseCategory,
      Recommendation,
      Course,
      CourseEnrollment,
      VideoProgress,
    ]),
  ],
  controllers: [CategoryController],
  providers: [CategoryService],
  exports: [CategoryService],
})
export class CategoryModule {}
