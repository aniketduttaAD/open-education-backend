import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { AdminService } from './services/admin.service';
import { AdminActivity, SystemConfig } from './entities';
import { User } from '../auth/entities/user.entity';
import { Course } from '../courses/entities/course.entity';
import { CourseEnrollment } from '../courses/entities/course-enrollment.entity';
// import { Payment } from '../payments/entities/payment.entity'; // Temporarily commented out to fix circular dependency
import { File } from '../storage/entities/file.entity';
import { QueueModule } from '../queue/queue.module';

/**
 * Admin module for platform administration and management
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      AdminActivity,
      SystemConfig,
      User,
      Course,
      CourseEnrollment,
      // Payment, // Temporarily commented out to fix circular dependency
      File,
    ]),
    QueueModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
