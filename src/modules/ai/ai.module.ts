import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AIController } from './ai.controller';
import { AIService } from './services/ai.service';
import { OpenAIService } from './services/openai.service';
import { VideoGenerationService } from './services/video-generation.service';
import { RAGService } from './services/rag.service';
import { AIBuddyUsage, VectorEmbedding } from './entities';
import { StudentTokenAllocation } from '../users/entities';
import { CourseSubtopic } from '../courses/entities/course-subtopic.entity';
import { CourseTopic } from '../courses/entities/course-topic.entity';
import { QueueModule } from '../queue/queue.module';

/**
 * AI module for AI-powered features and content generation
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      AIBuddyUsage,
      VectorEmbedding,
      StudentTokenAllocation,
      CourseSubtopic,
      CourseTopic,
    ]),
    forwardRef(() => QueueModule),
  ],
  controllers: [AIController],
  providers: [AIService, OpenAIService, VideoGenerationService, RAGService],
  exports: [AIService, OpenAIService, VideoGenerationService, RAGService],
})
export class AIModule {}
