import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AIController } from './ai.controller';
import { AIBuddyController } from './ai-buddy.controller';
import { AIService } from './services/ai.service';
import { OpenAIService } from './services/openai.service';
import { VideoGenerationService } from './services/video-generation.service';
import { RAGService } from './services/rag.service';
import { EmbeddingsService } from './services/embeddings.service';
import { AIBuddyService } from './services/ai-buddy.service';
import { AssessmentGenerationService } from './services/assessment-generation.service';
import { AIBuddyUsage, VectorEmbedding } from './entities';
import { AIBuddyChats } from './entities/ai-buddy-chats.entity';
import { StudentTokenAllocation } from '../users/entities';
import { CourseSubtopic } from '../courses/entities/course-subtopic.entity';
import { CourseSection } from '../courses/entities/course-section.entity';
import { Embeddings } from '../courses/entities/embeddings.entity';
import { Quiz, QuizQuestion, Flashcard } from '../assessments/entities';
import { QueueModule } from '../queue/queue.module';

/**
 * AI module for AI-powered features and content generation
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      AIBuddyUsage,
      AIBuddyChats,
      VectorEmbedding,
      StudentTokenAllocation,
      CourseSubtopic,
      CourseSection,
      Embeddings,
      Quiz,
      QuizQuestion,
      Flashcard,
    ]),
    forwardRef(() => QueueModule),
  ],
  controllers: [AIController, AIBuddyController],
  providers: [
    AIService,
    OpenAIService,
    VideoGenerationService,
    RAGService,
    EmbeddingsService,
    AIBuddyService,
    AssessmentGenerationService,
  ],
  exports: [
    AIService,
    OpenAIService,
    VideoGenerationService,
    RAGService,
    EmbeddingsService,
    AIBuddyService,
    AssessmentGenerationService,
  ],
})
export class AIModule {}
