import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { AssessmentsController } from './assessments.controller';
import { AssessmentsService } from './services/assessments.service';
import { EmbeddingsService } from './services/embeddings.service';
import { Quiz, QuizQuestion, Flashcard } from './entities';
import { Course } from '../courses/entities/course.entity';
import { CourseSection } from '../courses/entities/course-section.entity';
import { CourseSubtopic } from '../courses/entities/course-subtopic.entity';
import { VectorEmbedding } from '../ai/entities/vector-embedding.entity';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([
      Quiz,
      QuizQuestion,
      Flashcard,
      Course,
      CourseSection,
      CourseSubtopic,
      VectorEmbedding,
    ]),
  ],
  controllers: [AssessmentsController],
  providers: [AssessmentsService, EmbeddingsService],
  exports: [AssessmentsService, EmbeddingsService],
})
export class AssessmentsModule {}
