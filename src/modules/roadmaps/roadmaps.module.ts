import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RoadmapsController } from './roadmaps.controller';
import { RoadmapsService } from './roadmaps.service';
import { WebSocketModule } from '../websocket/websocket.module';
import { CoursesModule } from '../courses/courses.module';
import { CourseRoadmap, CourseGenerationProgress, CourseSection, CourseSubtopic } from '../courses/entities';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([CourseRoadmap, CourseGenerationProgress, CourseSection, CourseSubtopic]),
    forwardRef(() => WebSocketModule),
    forwardRef(() => CoursesModule),
  ],
  controllers: [RoadmapsController],
  providers: [RoadmapsService],
  exports: [RoadmapsService],
})
export class RoadmapsModule {}


