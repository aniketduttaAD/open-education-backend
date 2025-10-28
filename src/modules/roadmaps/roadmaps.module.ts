import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RoadmapsController } from './roadmaps.controller';
import { RoadmapsService } from './roadmaps.service';
import { WebSocketModule } from '../websocket/websocket.module';
import { CoursesModule } from '../courses/courses.module';
import { AssessmentsModule } from '../assessments/assessments.module';
import { CourseRoadmap, CourseGenerationProgress, CourseSection, CourseSubtopic, Course } from '../courses/entities';
import { Quiz, QuizQuestion, Flashcard } from '../assessments/entities';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([CourseRoadmap, CourseGenerationProgress, CourseSection, CourseSubtopic, Course, Quiz, QuizQuestion, Flashcard]),
    forwardRef(() => WebSocketModule),
    forwardRef(() => CoursesModule),
    forwardRef(() => AssessmentsModule),
  ],
  controllers: [RoadmapsController],
  providers: [RoadmapsService],
  exports: [RoadmapsService],
})
export class RoadmapsModule {}


