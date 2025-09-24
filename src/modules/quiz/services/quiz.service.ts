import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Quiz, QuizAttempt, QuizStreak, Flashcard } from '../entities';
import { CreateQuizDto, StartQuizAttemptDto, SubmitQuizAnswersDto, CreateFlashcardDto, ReviewFlashcardDto } from '../dto';
import { AIService } from '../../ai/services/ai.service';

@Injectable()
export class QuizService {
  constructor(
    @InjectRepository(Quiz)
    private quizRepository: Repository<Quiz>,
    @InjectRepository(QuizAttempt)
    private quizAttemptRepository: Repository<QuizAttempt>,
    @InjectRepository(QuizStreak)
    private quizStreakRepository: Repository<QuizStreak>,
    @InjectRepository(Flashcard)
    private flashcardRepository: Repository<Flashcard>,
    private aiService: AIService,
  ) {}

  async createQuiz(createQuizDto: CreateQuizDto, tutorId: string): Promise<Quiz> {
    const quiz = this.quizRepository.create({
      ...createQuizDto,
      total_questions: createQuizDto.questions?.length || 0,
    });

    return this.quizRepository.save(quiz);
  }

  async getQuizzesByCourse(courseId: string, page: number = 1, limit: number = 10): Promise<{ quizzes: Quiz[]; total: number }> {
    const [quizzes, total] = await this.quizRepository
      .createQueryBuilder('quiz')
      .leftJoinAndSelect('quiz.topic', 'topic')
      .leftJoinAndSelect('topic.course', 'course')
      .where('course.id = :courseId', { courseId })
      .andWhere('quiz.is_active = :isActive', { isActive: true })
      .orderBy('quiz.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { quizzes, total };
  }

  async getQuizById(quizId: string): Promise<Quiz> {
    const quiz = await this.quizRepository.findOne({
      where: { id: quizId },
      relations: ['topic'],
    });

    if (!quiz) {
      throw new NotFoundException('Quiz not found');
    }

    return quiz;
  }

  async startQuizAttempt(startQuizDto: StartQuizAttemptDto, studentId: string): Promise<QuizAttempt> {
    const quiz = await this.getQuizById(startQuizDto.quiz_id);

    // Check if student has reached max attempts
    const existingAttempts = await this.quizAttemptRepository.count({
      where: {
        student_id: studentId,
        quiz_id: startQuizDto.quiz_id,
      },
    });

    if (existingAttempts >= quiz.max_attempts) {
      throw new BadRequestException('Maximum attempts reached for this quiz');
    }

    // Check for existing in-progress attempt
    const inProgressAttempt = await this.quizAttemptRepository.findOne({
      where: {
        student_id: studentId,
        quiz_id: startQuizDto.quiz_id,
        status: 'in_progress',
      },
    });

    if (inProgressAttempt) {
      return inProgressAttempt;
    }

    const attempt = this.quizAttemptRepository.create({
      student_id: studentId,
      quiz_id: startQuizDto.quiz_id,
      enrollment_id: startQuizDto.enrollment_id,
      attempt_number: existingAttempts + 1,
      status: 'in_progress',
      started_at: new Date(),
      total_questions: quiz.total_questions,
    });

    return this.quizAttemptRepository.save(attempt);
  }

  async submitQuizAnswers(submitDto: SubmitQuizAnswersDto, studentId: string): Promise<QuizAttempt> {
    const attempt = await this.quizAttemptRepository.findOne({
      where: {
        id: submitDto.attempt_id,
        student_id: studentId,
      },
      relations: ['quiz'],
    });

    if (!attempt) {
      throw new NotFoundException('Quiz attempt not found');
    }

    if (attempt.status !== 'in_progress') {
      throw new BadRequestException('Quiz attempt is not in progress');
    }

    const quiz = attempt.quiz!;
    const answers = [];
    let correctAnswers = 0;
    let totalScore = 0;

    // Grade each answer
    for (const studentAnswer of submitDto.answers) {
      const question = quiz.questions?.find(q => q.id === studentAnswer.question_id);
      if (!question) continue;

      const isCorrect = this.gradeAnswer(question, studentAnswer.answer);
      const pointsEarned = isCorrect ? question.points : 0;

      answers.push({
        question_id: studentAnswer.question_id,
        answer: studentAnswer.answer,
        is_correct: isCorrect,
        points_earned: pointsEarned,
        time_spent_seconds: studentAnswer.time_spent_seconds,
      });

      if (isCorrect) {
        correctAnswers++;
        totalScore += pointsEarned;
      }
    }

    const percentage = (correctAnswers / quiz.total_questions) * 100;
    const passed = percentage >= quiz.passing_score;
    const timeTaken = Math.floor((new Date().getTime() - attempt.started_at!.getTime()) / 1000);

    // Generate feedback using AI
    const feedback = await this.generateQuizFeedback(quiz, answers, percentage);

    attempt.status = passed ? 'passed' : 'failed';
    attempt.score = Math.round(percentage);
    attempt.correct_answers = correctAnswers;
    attempt.completed_at = new Date();
    attempt.time_taken_seconds = timeTaken;
    attempt.answers = answers;
    attempt.feedback = feedback;

    const savedAttempt = await this.quizAttemptRepository.save(attempt);

    // Update quiz streak
    await this.updateQuizStreak(studentId, passed);

    return savedAttempt;
  }

  async getQuizAttempt(attemptId: string, studentId: string): Promise<QuizAttempt> {
    const attempt = await this.quizAttemptRepository.findOne({
      where: {
        id: attemptId,
        student_id: studentId,
      },
      relations: ['quiz'],
    });

    if (!attempt) {
      throw new NotFoundException('Quiz attempt not found');
    }

    return attempt;
  }

  async getStudentQuizAttempts(studentId: string, quizId?: string, page: number = 1, limit: number = 10): Promise<{ attempts: QuizAttempt[]; total: number }> {
    const queryBuilder = this.quizAttemptRepository
      .createQueryBuilder('attempt')
      .leftJoinAndSelect('attempt.quiz', 'quiz')
      .where('attempt.student_id = :studentId', { studentId });

    if (quizId) {
      queryBuilder.andWhere('attempt.quiz_id = :quizId', { quizId });
    }

    const [attempts, total] = await queryBuilder
      .orderBy('attempt.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { attempts, total };
  }

  async getQuizAnalytics(quizId: string): Promise<any> {
    const quiz = await this.getQuizById(quizId);
    
    const attempts = await this.quizAttemptRepository.find({
      where: { quiz_id: quizId },
    });

    const totalAttempts = attempts.length;
    const passedAttempts = attempts.filter(a => a.status === 'passed').length;
    const averageScore = attempts.reduce((sum, a) => sum + a.score, 0) / totalAttempts || 0;
    const averageTime = attempts.reduce((sum, a) => sum + a.time_taken_seconds, 0) / totalAttempts || 0;

    return {
      quiz_id: quizId,
      total_attempts: totalAttempts,
      passed_attempts: passedAttempts,
      pass_rate: totalAttempts > 0 ? (passedAttempts / totalAttempts) * 100 : 0,
      average_score: Math.round(averageScore),
      average_time_seconds: Math.round(averageTime),
      difficulty_distribution: this.calculateDifficultyDistribution(attempts),
    };
  }

  async createFlashcard(createFlashcardDto: CreateFlashcardDto): Promise<Flashcard> {
    const flashcard = this.flashcardRepository.create(createFlashcardDto);
    return this.flashcardRepository.save(flashcard);
  }

  async getFlashcardsBySubtopic(subtopicId: string): Promise<Flashcard[]> {
    return this.flashcardRepository.find({
      where: { subtopic_id: subtopicId, is_active: true },
      order: { created_at: 'ASC' },
    });
  }

  async reviewFlashcard(reviewDto: ReviewFlashcardDto, studentId: string): Promise<Flashcard> {
    const flashcard = await this.flashcardRepository.findOne({
      where: { id: reviewDto.flashcard_id },
    });

    if (!flashcard) {
      throw new NotFoundException('Flashcard not found');
    }

    // Update flashcard based on review quality (Spaced Repetition Algorithm)
    const { interval, easeFactor } = this.calculateSpacedRepetition(
      flashcard.interval_days,
      flashcard.ease_factor,
      reviewDto.quality,
    );

    flashcard.review_count += 1;
    flashcard.last_reviewed_at = new Date();
    flashcard.next_review_at = new Date(Date.now() + interval * 24 * 60 * 60 * 1000);
    flashcard.interval_days = interval;
    flashcard.ease_factor = easeFactor;

    if (reviewDto.quality >= 3) {
      flashcard.correct_count += 1;
    }

    flashcard.success_rate = (flashcard.correct_count / flashcard.review_count) * 100;

    return this.flashcardRepository.save(flashcard);
  }

  private gradeAnswer(question: any, studentAnswer: string | string[]): boolean {
    if (question.type === 'multiple_choice' || question.type === 'true_false') {
      return studentAnswer === question.correct_answer;
    } else if (question.type === 'short_answer') {
      const correctAnswers = Array.isArray(question.correct_answer) 
        ? question.correct_answer 
        : [question.correct_answer];
      return correctAnswers.some((correct: any) => 
        correct.toLowerCase().trim() === (studentAnswer as string).toLowerCase().trim()
      );
    }
    return false; // Essay questions need manual grading
  }

  private async generateQuizFeedback(quiz: Quiz, answers: any[], percentage: number): Promise<any> {
    try {
      const strengths = answers.filter(a => a.is_correct).map(a => a.question_id);
      const weaknesses = answers.filter(a => !a.is_correct).map(a => a.question_id);

      return {
        overall_feedback: `You scored ${percentage.toFixed(1)}% on this quiz.`,
        strengths: strengths.length > 0 ? ['Good understanding of key concepts'] : [],
        areas_for_improvement: weaknesses.length > 0 ? ['Review the topics you missed'] : [],
        recommended_resources: ['Review course materials', 'Practice more questions'],
      };
    } catch (error) {
      return {
        overall_feedback: `You scored ${percentage.toFixed(1)}% on this quiz.`,
        strengths: [],
        areas_for_improvement: [],
        recommended_resources: [],
      };
    }
  }

  private async updateQuizStreak(studentId: string, passed: boolean): Promise<void> {
    let streak = await this.quizStreakRepository.findOne({
      where: { student_id: studentId },
    });

    if (!streak) {
      streak = this.quizStreakRepository.create({
        student_id: studentId,
        current_streak: 0,
        best_streak: 0,
        total_quizzes_completed: 0,
        total_quizzes_passed: 0,
        average_score: 0,
      });
    }

    streak.total_quizzes_completed += 1;
    if (passed) {
      streak.total_quizzes_passed += 1;
      streak.current_streak += 1;
      if (streak.current_streak > streak.best_streak) {
        streak.best_streak = streak.current_streak;
      }
    } else {
      streak.current_streak = 0;
    }

    streak.last_quiz_date = new Date();
    await this.quizStreakRepository.save(streak);
  }

  private calculateSpacedRepetition(interval: number, easeFactor: number, quality: number): { interval: number; easeFactor: number } {
    if (quality < 3) {
      return { interval: 1, easeFactor: Math.max(1.3, easeFactor - 0.2) };
    }

    const newEaseFactor = Math.max(1.3, easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));
    const newInterval = Math.round(interval * newEaseFactor);

    return { interval: newInterval, easeFactor: newEaseFactor };
  }

  private calculateDifficultyDistribution(attempts: QuizAttempt[]): any {
    const distribution = {
      easy: 0,
      medium: 0,
      hard: 0,
    };

    attempts.forEach(attempt => {
      if (attempt.score >= 80) distribution.easy++;
      else if (attempt.score >= 60) distribution.medium++;
      else distribution.hard++;
    });

    return distribution;
  }
}
