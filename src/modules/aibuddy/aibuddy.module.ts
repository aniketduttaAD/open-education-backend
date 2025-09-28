import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { AIBuddyController } from './aibuddy.controller';
import { AIBuddyService } from './services/aibuddy.service';
import { AIBuddyUsage } from '../ai/entities/ai-buddy-usage.entity';
import { Course } from '../courses/entities/course.entity';
import { CourseEnrollment } from '../courses/entities/course-enrollment.entity';
import { AssessmentsModule } from '../assessments/assessments.module';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([
      AIBuddyUsage,
      Course,
      CourseEnrollment,
    ]),
    forwardRef(() => AssessmentsModule),
  ],
  controllers: [AIBuddyController],
  providers: [AIBuddyService],
  exports: [AIBuddyService],
})
export class AIBuddyModule {}
