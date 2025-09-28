import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { AIBuddyUsage } from '../../ai/entities/ai-buddy-usage.entity';
import { Course } from '../../courses/entities/course.entity';
import { CourseEnrollment } from '../../courses/entities/course-enrollment.entity';
import { EmbeddingsService } from '../../assessments/services/embeddings.service';
import { AIBuddyQueryDto } from '../dto/query.dto';
import getOpenAIConfig from '../../../config/openai.config';

@Injectable()
export class AIBuddyService {
  private readonly logger = new Logger(AIBuddyService.name);
  private readonly openai: OpenAI;

  constructor(
    @InjectRepository(AIBuddyUsage)
    private aiBuddyUsageRepository: Repository<AIBuddyUsage>,
    @InjectRepository(Course)
    private courseRepository: Repository<Course>,
    @InjectRepository(CourseEnrollment)
    private enrollmentRepository: Repository<CourseEnrollment>,
    private embeddingsService: EmbeddingsService,
    private configService: ConfigService,
  ) {
    const ai = getOpenAIConfig(this.configService);
    this.openai = new OpenAI({ apiKey: ai.apiKey });
  }

  /**
   * Process AI Buddy query with RAG
   */
  async processQuery(dto: AIBuddyQueryDto, userId: string): Promise<{
    answer: string;
    sources: string[];
    hasContext: boolean;
  }> {
    this.logger.log(`Processing AI Buddy query for user ${userId} in course ${dto.courseId}`);

    // Verify user is enrolled in the course
    const enrollment = await this.enrollmentRepository.findOne({
      where: {
        student_id: userId,
        course_id: dto.courseId,
        status: 'active',
      },
    });

    if (!enrollment) {
      throw new Error('User is not enrolled in this course');
    }

    // Verify course exists
    const course = await this.courseRepository.findOne({ where: { id: dto.courseId } });
    if (!course) {
      throw new Error('Course not found');
    }

    // Generate embedding for the user query
    const queryEmbedding = await this.generateQueryEmbedding(dto.message);

    // Search for relevant content using vector similarity
    const relevantContent = await this.embeddingsService.searchEmbeddings(
      queryEmbedding,
      dto.courseId,
      0.7, // Similarity threshold
      5, // Max results
    );

    // If no relevant content found, refuse to answer
    if (relevantContent.length === 0) {
      this.logger.log(`No relevant content found for query: ${dto.message}`);
      
      // Record usage
      await this.recordUsage(dto.courseId, userId, dto.message, '', false);
      
      return {
        answer: 'I cannot answer this question based on the course materials. Please ask something related to the course content.',
        sources: [],
        hasContext: false,
      };
    }

    // Prepare context from retrieved content
    const context = this.prepareContext(relevantContent);
    const sources = relevantContent.map((item) => `${item.content_type}: ${item.content_id || item.course_id}`);

    // Generate answer using OpenAI with context
    const answer = await this.generateAnswer(dto.message, context);

    // Record usage
    await this.recordUsage(dto.courseId, userId, dto.message, answer, true);

    this.logger.log(`Generated answer for query: ${dto.message}`);

    return {
      answer,
      sources,
      hasContext: true,
    };
  }

  /**
   * Generate embedding for user query
   */
  private async generateQueryEmbedding(query: string): Promise<number[]> {
    try {
      const response = await this.openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: query,
      });
      
      return response.data[0].embedding;
    } catch (error) {
      this.logger.error(`Failed to generate query embedding: ${error.message}`);
      throw new Error('Failed to generate query embedding');
    }
  }

  /**
   * Prepare context from retrieved embeddings
   */
  private prepareContext(embeddings: any[]): string {
    // For now, return a placeholder context
    // In a full implementation, you'd retrieve the actual content using content_text
    return embeddings
      .map((item, index) => `Context ${index + 1} (${item.content_type}): ${item.content_text || 'Course content related to the query.'}`)
      .join('\n\n');
  }

  /**
   * Generate answer using OpenAI with context
   */
  private async generateAnswer(userMessage: string, context: string): Promise<string> {
    const prompt = [
      'You are an AI tutor constrained to the provided course context. If information is not in context, say you cannot answer based on course materials.',
      'Context:',
      context,
      '',
      'User question:',
      userMessage,
      '',
      'Answer clearly and concisely, referencing the context. Do not introduce external topics.',
    ].join('\n');

    try {
      const response = await this.openai.chat.completions.create({
        model: this.configService.get<string>('OPENAI_CHAT_MODEL') || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are a helpful AI tutor for this course.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 500,
      });

      const answer = response.choices[0]?.message?.content;
      if (!answer) {
        throw new Error('No response from OpenAI');
      }

      return answer;
    } catch (error) {
      this.logger.error(`Failed to generate answer: ${error.message}`);
      return 'I apologize, but I encountered an error while generating an answer. Please try again.';
    }
  }

  /**
   * Record AI Buddy usage
   */
  private async recordUsage(
    courseId: string,
    userId: string,
    query: string,
    answer: string,
    hasContext: boolean,
  ): Promise<void> {
    try {
      await this.aiBuddyUsageRepository.save({
        course_id: courseId,
        user_id: userId,
        conversation_type: 'course_help',
        user_message: query,
        ai_response: answer,
        tokens_used: this.estimateTokens(query + answer),
        context_data: { has_context: hasContext },
      });
    } catch (error) {
      this.logger.error(`Failed to record AI Buddy usage: ${error.message}`);
      // Don't throw - this is not critical
    }
  }

  /**
   * Estimate token usage (rough approximation)
   */
  private estimateTokens(text: string): number {
    // Rough estimation: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }

  /**
   * Get AI Buddy usage statistics for a user
   */
  async getUsageStats(userId: string, courseId?: string): Promise<{
    totalQueries: number;
    queriesWithContext: number;
    totalTokens: number;
    recentQueries: Array<{
      query: string;
      hasContext: boolean;
      createdAt: Date;
    }>;
  }> {
    const whereCondition: any = { user_id: userId };
    if (courseId) {
      whereCondition.course_id = courseId;
    }

    const usage = await this.aiBuddyUsageRepository.find({
      where: whereCondition,
      order: { created_at: 'DESC' },
      take: 10,
    });

    const totalQueries = await this.aiBuddyUsageRepository.count({ where: whereCondition });
    const queriesWithContext = await this.aiBuddyUsageRepository
      .createQueryBuilder('usage')
      .where('usage.user_id = :userId', { userId })
      .andWhere(courseId ? 'usage.course_id = :courseId' : '1=1', { courseId })
      .andWhere("usage.context_data->>'has_context' = 'true'")
      .getCount();

    const totalTokensResult = await this.aiBuddyUsageRepository
      .createQueryBuilder('usage')
      .select('SUM(usage.tokens_used)', 'total')
      .where('usage.user_id = :userId', { userId })
      .andWhere(courseId ? 'usage.course_id = :courseId' : '1=1', { courseId })
      .getRawOne();

    return {
      totalQueries,
      queriesWithContext,
      totalTokens: parseInt(totalTokensResult?.total || '0'),
      recentQueries: usage.map((u) => ({
        query: u.user_message,
        hasContext: u.context_data?.has_context || false,
        createdAt: u.created_at,
      })),
    };
  }
}
