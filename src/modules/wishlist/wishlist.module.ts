import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WishlistController } from './wishlist.controller';
import { WishlistService } from './services/wishlist.service';
import { Wishlist } from './entities';
import { Course } from '../courses/entities/course.entity';
import { CourseEnrollment } from '../courses/entities/course-enrollment.entity';

/**
 * Wishlist module for wishlist management
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Wishlist,
      Course,
      CourseEnrollment,
    ]),
  ],
  controllers: [WishlistController],
  providers: [WishlistService],
  exports: [WishlistService],
})
export class WishlistModule {}
