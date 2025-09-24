import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QuizController } from './quiz.controller';
import { QuizService } from './services/quiz.service';
import { Quiz, QuizAttempt, QuizStreak, Flashcard } from './entities';
import { AIModule } from '../ai/ai.module';

/**
 * Quiz module for quiz and assessment management
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Quiz,
      QuizAttempt,
      QuizStreak,
      Flashcard,
    ]),
    AIModule,
  ],
  controllers: [QuizController],
  providers: [QuizService],
  exports: [QuizService],
})
export class QuizModule {}
