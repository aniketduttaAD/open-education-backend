import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import * as fs from 'fs-extra';
import { Quiz } from '../../assessments/entities/quiz.entity';
import { QuizQuestion as QuizQuestionEntity } from '../../assessments/entities/quiz-question.entity';
import { Flashcard as FlashcardEntity } from '../../assessments/entities/flashcard.entity';

interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation?: string;
}

interface Flashcard {
  front: string;
  back: string;
  subtopicId: string;
}

@Injectable()
export class AssessmentGenerationService {
  private readonly logger = new Logger(AssessmentGenerationService.name);
  private readonly openai: OpenAI;

  constructor(
    private configService: ConfigService,
    @InjectRepository(Quiz)
    private readonly quizRepository: Repository<Quiz>,
    @InjectRepository(QuizQuestionEntity)
    private readonly questionRepository: Repository<QuizQuestionEntity>,
    @InjectRepository(FlashcardEntity)
    private readonly flashcardRepository: Repository<FlashcardEntity>,
  ) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
    });
  }

  /**
   * Generate quizzes for all sections in a course
   */
  async generateCourseAssessments(courseId: string, sections: any[]): Promise<void> {
    this.logger.log(`Starting assessment generation for course: ${courseId}`);

    try {
      for (const section of sections) {
        // Generate quiz for the entire section (main topic)
        await this.generateSectionQuiz(courseId, section);

        // Generate flashcards for each subtopic in the section
        for (const subtopic of section.subtopics || []) {
          await this.generateSubtopicFlashcards(courseId, section.id, subtopic);
        }
      }

      this.logger.log(`Completed assessment generation for course: ${courseId}`);
    } catch (error) {
      this.logger.error(`Failed to generate assessments for course ${courseId}:`, error);
      throw error;
    }
  }

  /**
   * Generate MCQ quiz for a section (main topic)
   * Per Phase 3.2 requirements:
   * 1. Analyze section content (all subtopics)
   * 2. Generate MCQ questions using OpenAI
   * 3. Include 4 options with 1 correct answer
   * 4. Store in quizzes and quiz_questions tables
   */
  private async generateSectionQuiz(courseId: string, section: any): Promise<void> {
    this.logger.log(`Generating quiz for section: ${section.title}`);

    try {
      // Step 1: Analyze section content (all subtopics)
      const sectionContent = await this.collectSectionContent(section);

      if (!sectionContent || sectionContent.trim().length === 0) {
        this.logger.warn(`No content found for section: ${section.title}`);
        return;
      }

      // Step 2: Generate MCQ questions using OpenAI
      const quizQuestions = await this.generateQuizQuestions(section.title, sectionContent);

      if (quizQuestions.length === 0) {
        this.logger.warn(`No quiz questions generated for section: ${section.title}`);
        return;
      }

      // Step 3: Include 4 options with 1 correct answer (validated in generateQuizQuestions)
      // Step 4: Store in quizzes and quiz_questions tables
      
      // Create quiz entity
      const quiz = this.quizRepository.create({
        course_id: courseId,
        section_id: section.id,
        title: `${section.title} Quiz`,
      });

      const savedQuiz = await this.quizRepository.save(quiz);

      // Save questions with proper indexing
      for (let i = 0; i < quizQuestions.length; i++) {
        const question = quizQuestions[i];
        const questionEntity = this.questionRepository.create({
          quiz_id: savedQuiz.id,
          index: i,
          question: question.question,
          options: question.options, // Already an array, no need to JSON.stringify
          correct_index: question.correctIndex,
        });

        await this.questionRepository.save(questionEntity);
      }

      this.logger.log(`Created quiz for section: ${section.title} with ${quizQuestions.length} questions`);
    } catch (error) {
      this.logger.error(`Failed to generate quiz for section ${section.title}:`, error);
      throw error;
    }
  }

  /**
   * Generate flashcards for a subtopic
   * Per Phase 3.3 requirements:
   * 1. Extract key concepts from markdown + transcript
   * 2. Create question/answer pairs
   * 3. Store in flashcards table
   */
  private async generateSubtopicFlashcards(courseId: string, sectionId: string, subtopic: any): Promise<void> {
    this.logger.log(`Generating flashcards for subtopic: ${subtopic.title}`);

    try {
      // Step 1: Extract key concepts from markdown + transcript
      let content = '';

      if (subtopic.markdown_path && await fs.pathExists(subtopic.markdown_path)) {
        const markdownContent = await fs.readFile(subtopic.markdown_path, 'utf8');
        content += `Markdown Content:\n${markdownContent}\n\n`;
      }

      if (subtopic.transcript_path && await fs.pathExists(subtopic.transcript_path)) {
        const transcriptContent = await fs.readFile(subtopic.transcript_path, 'utf8');
        content += `Transcript Content:\n${transcriptContent}`;
      }

      if (!content || content.trim().length === 0) {
        this.logger.warn(`No content found for subtopic: ${subtopic.title}`);
        return;
      }

      // Step 2: Create question/answer pairs
      const flashcards = await this.generateFlashcards(subtopic.title, content);

      if (flashcards.length === 0) {
        this.logger.warn(`No flashcards generated for subtopic: ${subtopic.title}`);
        return;
      }

      // Step 3: Store in flashcards table
      for (let i = 0; i < flashcards.length; i++) {
        const flashcard = flashcards[i];
        const flashcardEntity = this.flashcardRepository.create({
          course_id: courseId,
          section_id: sectionId,
          index: i,
          front: flashcard.front,
          back: flashcard.back,
        });

        await this.flashcardRepository.save(flashcardEntity);
      }

      this.logger.log(`Created ${flashcards.length} flashcards for subtopic: ${subtopic.title}`);
    } catch (error) {
      this.logger.error(`Failed to generate flashcards for subtopic ${subtopic.title}:`, error);
      throw error;
    }
  }

  /**
   * Generate quiz questions using OpenAI
   * Per Phase 3.2 requirements:
   * - Generate MCQ questions using OpenAI
   * - Include 4 options with 1 correct answer
   * - Follow QuizQuestion interface structure
   */
  private async generateQuizQuestions(sectionTitle: string, content: string): Promise<QuizQuestion[]> {
    const prompt = [
      'You are an expert educator creating multiple-choice quiz questions.',
      'Create 5-8 high-quality MCQ questions based on the provided content.',
      '',
      `Section: ${sectionTitle}`,
      '',
      'Content:',
      content,
      '',
      'Requirements:',
      '- Each question should have exactly 4 options (A, B, C, D)',
      '- Only one option should be correct',
      '- Questions should test understanding, not just memorization',
      '- Include a mix of difficulty levels',
      '- Avoid trick questions',
      '- correctIndex should be 0-3 (0 for first option, 1 for second, etc.)',
      '',
      'Return a JSON array with this exact structure:',
      '[',
      '  {',
      '    "question": "What is...?",',
      '    "options": ["Option A", "Option B", "Option C", "Option D"],',
      '    "correctIndex": 0,',
      '    "explanation": "Brief explanation of why this is correct"',
      '  }',
      ']',
      '',
      'Return ONLY the JSON array, no other text.',
    ].join('\n');

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 2000,
        temperature: 0.3,
        response_format: { type: 'json_object' },
      });

      const responseContent = response.choices[0]?.message?.content;
      if (!responseContent) {
        this.logger.warn('No content received from OpenAI for quiz questions');
        return [];
      }

      // Try to parse the JSON response
      let questions: QuizQuestion[];
      try {
        const parsed = JSON.parse(responseContent);
        questions = Array.isArray(parsed) ? parsed : parsed.questions || [];
      } catch (parseError) {
        this.logger.error('Failed to parse quiz questions JSON:', parseError);
        this.logger.debug('Raw response:', responseContent);
        return [];
      }

      // Validate question structure per Phase 3.2 requirements
      const validQuestions = questions.filter(q => {
        const isValid = q.question &&
          Array.isArray(q.options) &&
          q.options.length === 4 &&
          typeof q.correctIndex === 'number' &&
          q.correctIndex >= 0 &&
          q.correctIndex < 4 &&
          q.question.trim().length > 0 &&
          q.options.every(option => typeof option === 'string' && option.trim().length > 0);

        if (!isValid) {
          this.logger.warn(`Invalid question structure: ${JSON.stringify(q)}`);
        }

        return isValid;
      });

      this.logger.log(`Generated ${validQuestions.length} valid quiz questions for section: ${sectionTitle}`);
      return validQuestions;

    } catch (error) {
      this.logger.error('Failed to generate quiz questions:', error);
      return [];
    }
  }

  /**
   * Generate flashcards using OpenAI
   * Per Phase 3.3 requirements:
   * - Extract key concepts from markdown + transcript
   * - Create question/answer pairs
   * - Follow Flashcard interface structure
   */
  private async generateFlashcards(subtopicTitle: string, content: string): Promise<Flashcard[]> {
    const prompt = [
      'You are an expert educator creating flashcards for studying.',
      'Create 8-12 high-quality flashcards based on the provided content.',
      '',
      `Subtopic: ${subtopicTitle}`,
      '',
      'Content:',
      content.substring(0, 3000), // Limit content length
      '',
      'Requirements:',
      '- Front: Clear, concise question or key term',
      '- Back: Comprehensive but concise answer or explanation',
      '- Cover the most important concepts from the content',
      '- Include definitions, key processes, and important facts',
      '- Avoid overly complex questions',
      '',
      'Return a JSON array with this exact structure:',
      '[',
      '  {',
      '    "front": "What is...?",',
      '    "back": "Detailed explanation or definition..."',
      '  }',
      ']',
      '',
      'Return ONLY the JSON array, no other text.',
    ].join('\n');

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1500,
        temperature: 0.4,
        response_format: { type: 'json_object' },
      });

      const responseContent = response.choices[0]?.message?.content;
      if (!responseContent) {
        this.logger.warn('No content received from OpenAI for flashcards');
        return [];
      }

      // Try to parse the JSON response
      let flashcards: Flashcard[];
      try {
        const parsed = JSON.parse(responseContent);
        flashcards = Array.isArray(parsed) ? parsed : parsed.flashcards || [];
      } catch (parseError) {
        this.logger.error('Failed to parse flashcards JSON:', parseError);
        this.logger.debug('Raw response:', responseContent);
        return [];
      }

      // Validate flashcard structure per Phase 3.3 requirements
      const validFlashcards = flashcards.filter(f => {
        const isValid = f.front &&
          f.back &&
          f.front.trim().length > 0 &&
          f.back.trim().length > 0;

        if (!isValid) {
          this.logger.warn(`Invalid flashcard structure: ${JSON.stringify(f)}`);
        }

        return isValid;
      });

      this.logger.log(`Generated ${validFlashcards.length} valid flashcards for subtopic: ${subtopicTitle}`);
      return validFlashcards;

    } catch (error) {
      this.logger.error('Failed to generate flashcards:', error);
      return [];
    }
  }

  /**
   * Collect all content from subtopics in a section
   * Per Phase 3.2 requirements: Analyze section content (all subtopics)
   */
  private async collectSectionContent(section: any): Promise<string> {
    const contentPieces: string[] = [];
    contentPieces.push(`Section: ${section.title}\n`);

    // Analyze all subtopics in the section
    for (const subtopic of section.subtopics || []) {
      if (!subtopic || !subtopic.title) {
        this.logger.warn(`Invalid subtopic data: ${JSON.stringify(subtopic)}`);
        continue;
      }

      let subtopicContent = `\n--- ${subtopic.title} ---\n`;

      // Read markdown content if available
      if (subtopic.markdown_path && await fs.pathExists(subtopic.markdown_path)) {
        try {
          const markdownContent = await fs.readFile(subtopic.markdown_path, 'utf8');
          if (markdownContent && markdownContent.trim().length > 0) {
            subtopicContent += `Markdown Content:\n${markdownContent}\n`;
          }
        } catch (error) {
          this.logger.error(`Failed to read markdown for subtopic ${subtopic.title}:`, error);
        }
      }

      // Read transcript content if available
      if (subtopic.transcript_path && await fs.pathExists(subtopic.transcript_path)) {
        try {
          const transcriptContent = await fs.readFile(subtopic.transcript_path, 'utf8');
          if (transcriptContent && transcriptContent.trim().length > 0) {
            subtopicContent += `Transcript Content:\n${transcriptContent}\n`;
          }
        } catch (error) {
          this.logger.error(`Failed to read transcript for subtopic ${subtopic.title}:`, error);
        }
      }

      contentPieces.push(subtopicContent);
    }

    const combinedContent = contentPieces.join('\n');
    this.logger.debug(`Collected ${combinedContent.length} characters of content for section: ${section.title}`);
    return combinedContent;
  }

  /**
   * Get quiz statistics for a course
   */
  async getQuizStats(courseId: string): Promise<any> {
    try {
      const stats = await this.quizRepository
        .createQueryBuilder('quiz')
        .leftJoin('quiz_questions', 'questions', 'questions.quiz_id = quiz.id')
        .select('COUNT(DISTINCT quiz.id)', 'totalQuizzes')
        .addSelect('COUNT(questions.id)', 'totalQuestions')
        .addSelect('COUNT(DISTINCT quiz.section_id)', 'sectionsWithQuizzes')
        .where('quiz.course_id = :courseId', { courseId })
        .getRawOne();

      return {
        totalQuizzes: parseInt(stats.totalQuizzes) || 0,
        totalQuestions: parseInt(stats.totalQuestions) || 0,
        sectionsWithQuizzes: parseInt(stats.sectionsWithQuizzes) || 0,
      };
    } catch (error) {
      this.logger.error('Failed to get quiz stats:', error);
      return { totalQuizzes: 0, totalQuestions: 0, sectionsWithQuizzes: 0 };
    }
  }

  /**
   * Get flashcard statistics for a course
   */
  async getFlashcardStats(courseId: string): Promise<any> {
    try {
      const stats = await this.flashcardRepository
        .createQueryBuilder('flashcard')
        .select('COUNT(*)', 'totalFlashcards')
        .addSelect('COUNT(DISTINCT flashcard.section_id)', 'sectionsWithFlashcards')
        .where('flashcard.course_id = :courseId', { courseId })
        .getRawOne();

      return {
        totalFlashcards: parseInt(stats.totalFlashcards) || 0,
        sectionsWithFlashcards: parseInt(stats.sectionsWithFlashcards) || 0,
      };
    } catch (error) {
      this.logger.error('Failed to get flashcard stats:', error);
      return { totalFlashcards: 0, sectionsWithFlashcards: 0 };
    }
  }
}