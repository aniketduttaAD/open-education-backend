import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { Quiz } from '../entities/quiz.entity';
import { QuizQuestion } from '../entities/quiz-question.entity';
import { Flashcard } from '../entities/flashcard.entity';
import { Course } from '../../courses/entities/course.entity';
import { CourseSection } from '../../courses/entities/course-section.entity';
import { EmbeddingsService } from './embeddings.service';
import { GenerateAssessmentsDto } from '../dto/generate-assessments.dto';
import getOpenAIConfig from '../../../config/openai.config';

@Injectable()
export class AssessmentsService {
  private readonly logger = new Logger(AssessmentsService.name);
  private readonly openai: OpenAI;

  constructor(
    @InjectRepository(Quiz)
    private quizRepository: Repository<Quiz>,
    @InjectRepository(QuizQuestion)
    private quizQuestionRepository: Repository<QuizQuestion>,
    @InjectRepository(Flashcard)
    private flashcardRepository: Repository<Flashcard>,
    @InjectRepository(Course)
    private courseRepository: Repository<Course>,
    @InjectRepository(CourseSection)
    private sectionRepository: Repository<CourseSection>,
    private embeddingsService: EmbeddingsService,
    private configService: ConfigService,
  ) {
    const ai = getOpenAIConfig(this.configService);
    this.openai = new OpenAI({ apiKey: ai.apiKey });
  }

  /**
   * Generate assessments (quizzes and flashcards) for a course
   */
  async generateAssessments(dto: GenerateAssessmentsDto): Promise<{
    quizIds: string[];
    flashcardIds: string[];
  }> {
    this.logger.log(`Generating assessments for course ${dto.id}`);

    const course = await this.courseRepository.findOne({ where: { id: dto.id } });
    if (!course) {
      throw new Error(`Course ${dto.id} not found`);
    }

    // Ensure embeddings are computed
    await this.embeddingsService.computeAndStoreEmbeddings(dto.id);

    // Get all sections for this course
    const sections = await this.sectionRepository.find({
      where: { course_id: dto.id },
      order: { index: 'ASC' },
    });

    const quizIds: string[] = [];
    const flashcardIds: string[] = [];

    // Generate assessments for each section
    for (const section of sections) {
      if (dto.perSection?.quizCount && dto.perSection.quizCount > 0) {
        const quizId = await this.generateQuizForSection(section, dto.perSection.quizCount);
        quizIds.push(quizId);
      }

      if (dto.perSection?.flashcardCount && dto.perSection.flashcardCount > 0) {
        const flashcardIdsForSection = await this.generateFlashcardsForSection(
          section,
          dto.perSection.flashcardCount,
        );
        flashcardIds.push(...flashcardIdsForSection);
      }
    }

    this.logger.log(`Generated ${quizIds.length} quizzes and ${flashcardIds.length} flashcards`);

    return { quizIds, flashcardIds };
  }

  /**
   * Generate quiz for a specific section
   */
  private async generateQuizForSection(section: CourseSection, questionCount: number): Promise<string> {
    this.logger.log(`Generating quiz for section ${section.id} with ${questionCount} questions`);

    // Get section content for context
    const context = await this.getSectionContext(section);

    // Generate quiz questions using OpenAI
    const questions = await this.generateQuizQuestions(context, questionCount);

    // Create quiz record
    const quiz = await this.quizRepository.save({
      course_id: section.course_id,
      section_id: section.id,
      title: `Quiz: ${section.title}`,
    });

    // Create quiz questions
    for (let i = 0; i < questions.length; i++) {
      const question = questions[i];
      await this.quizQuestionRepository.save({
        quiz_id: quiz.id,
        index: i,
        question: question.question,
        options: question.options,
        correct_index: question.correct_index,
      });
    }

    this.logger.log(`Created quiz ${quiz.id} with ${questions.length} questions`);
    return quiz.id;
  }

  /**
   * Generate flashcards for a specific section
   */
  private async generateFlashcardsForSection(
    section: CourseSection,
    cardCount: number,
  ): Promise<string[]> {
    this.logger.log(`Generating ${cardCount} flashcards for section ${section.id}`);

    // Get section content for context
    const context = await this.getSectionContext(section);

    // Generate flashcards using OpenAI
    const cards = await this.generateFlashcardContent(context, cardCount);

    const flashcardIds: string[] = [];

    // Create flashcard records
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      const flashcard = await this.flashcardRepository.save({
        course_id: section.course_id,
        section_id: section.id,
        index: i,
        front: card.front,
        back: card.back,
      });
      flashcardIds.push(flashcard.id);
    }

    this.logger.log(`Created ${flashcardIds.length} flashcards for section ${section.id}`);
    return flashcardIds;
  }

  /**
   * Get section context for assessment generation
   */
  private async getSectionContext(section: CourseSection): Promise<string> {
    try {
      // Use embeddings service to get section content
      const embeddings = await this.embeddingsService.searchEmbeddings(
        [], // We'll get all embeddings for this section
        section.course_id,
        0.0, // Low threshold to get all content
        100, // High limit
      );

      // Filter for section-level embeddings
      const sectionEmbeddings = embeddings.filter(
        (e) => e.content_id === section.id && e.content_type === 'section',
      );

      if (sectionEmbeddings.length === 0) {
        return `Section: ${section.title}\n\nContent not yet generated.`;
      }

      // For now, return section title
      // In a full implementation, you'd retrieve the actual content using the content_hash
      return `Section: ${section.title}\n\nThis section covers the fundamentals and key concepts.`;
    } catch (error) {
      this.logger.warn(`Failed to get context for section ${section.id}: ${error.message}`);
      return `Section: ${section.title}\n\nContent not yet generated.`;
    }
  }

  /**
   * Generate quiz questions using OpenAI
   */
  private async generateQuizQuestions(context: string, count: number): Promise<{
    question: string;
    options: string[];
    correct_index: number;
    rationale: string;
  }[]> {
    const prompt = [
      'You are generating rigorous but approachable MCQs.',
      'Context (do not invent beyond this):',
      context,
      '',
      `Generate exactly ${count} multiple choice questions.`,
      'Return JSON ONLY:',
      '{',
      '  "questions": [',
      '    {"question": "...", "options": ["A","B","C","D"], "correct_index": 2, "rationale": "..."}',
      '  ]',
      '}',
    ].join('\n');

    try {
      const response = await this.openai.chat.completions.create({
        model: this.configService.get<string>('OPENAI_CHAT_MODEL') || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are an expert educator creating assessment questions.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from OpenAI');
      }

      const parsed = JSON.parse(content);
      return parsed.questions || [];
    } catch (error) {
      this.logger.error(`Failed to generate quiz questions: ${error.message}`);
      // Return fallback questions
      return [
        {
          question: 'What is the main topic of this section?',
          options: ['Option A', 'Option B', 'Option C', 'Option D'],
          correct_index: 0,
          rationale: 'This is a fallback question.',
        },
      ];
    }
  }

  /**
   * Generate flashcard content using OpenAI
   */
  private async generateFlashcardContent(context: string, count: number): Promise<{
    front: string;
    back: string;
  }[]> {
    const prompt = [
      'You are generating concise flashcards (front/back) from the context. No extra fluff.',
      'Context:',
      context,
      '',
      `Generate exactly ${count} flashcards.`,
      'Return JSON ONLY:',
      '{',
      '  "cards": [',
      '    {"front": "...", "back": "..."}',
      '  ]',
      '}',
    ].join('\n');

    try {
      const response = await this.openai.chat.completions.create({
        model: this.configService.get<string>('OPENAI_CHAT_MODEL') || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are an expert educator creating flashcards.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from OpenAI');
      }

      const parsed = JSON.parse(content);
      return parsed.cards || [];
    } catch (error) {
      this.logger.error(`Failed to generate flashcards: ${error.message}`);
      // Return fallback flashcards
      return [
        {
          front: 'What is the main concept?',
          back: 'This is the main concept explanation.',
        },
      ];
    }
  }

  /**
   * Get assessments for a course
   */
  async getAssessments(courseId: string): Promise<{
    quizzes: Array<{
      id: string;
      title: string;
      sectionId: string;
      questionCount: number;
      createdAt: Date;
    }>;
    flashcards: Array<{
      id: string;
      sectionId: string;
      front: string;
      back: string;
      index: number;
      createdAt: Date;
    }>;
  }> {
    const quizzes = await this.quizRepository.find({
      where: { course_id: courseId },
      relations: ['questions'],
      order: { created_at: 'ASC' },
    });

    const flashcards = await this.flashcardRepository.find({
      where: { course_id: courseId },
      order: { section_id: 'ASC', index: 'ASC' },
    });

    return {
      quizzes: quizzes.map((quiz) => ({
        id: quiz.id,
        title: quiz.title,
        sectionId: quiz.section_id,
        questionCount: quiz.questions?.length || 0,
        createdAt: quiz.created_at,
      })),
      flashcards: flashcards.map((card) => ({
        id: card.id,
        sectionId: card.section_id,
        front: card.front,
        back: card.back,
        index: card.index,
        createdAt: card.created_at,
      })),
    };
  }
}
