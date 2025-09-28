import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { EmbeddingsService } from './embeddings.service';
import { AIBuddyChats } from '../entities/ai-buddy-chats.entity';

interface AIBuddyChatMessage {
  id: string;
  courseId: string;
  userId: string;
  sessionId: string;
  message: string;
  isUserMessage: boolean;
  response?: string;
  embeddingResults?: any[];
  timestamp: Date;
}

interface AIBuddyResponse {
  response: string;
  sources?: any[];
  tokensUsed?: number;
  remainingTokens?: number;
}

interface AIBuddyConfig {
  courseId: string;
  embeddingModel: 'text-embedding-3-small';
  similarityThreshold: 0.7;
  maxResults: 10;
  fallbackMessage: "I don't know that, sorry can't help with that";
}

@Injectable()
export class AIBuddyService {
  private readonly logger = new Logger(AIBuddyService.name);
  private readonly openai: OpenAI;
  private readonly fallbackMessage = "I don't know that, sorry can't help with that";

  constructor(
    private configService: ConfigService,
    private embeddingsService: EmbeddingsService,
    @InjectRepository(AIBuddyChats)
    private readonly chatRepository: Repository<AIBuddyChats>,
  ) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
    });
  }

  /**
   * Process AI buddy chat message
   */
  async chatWithAIBuddy(
    userId: string,
    courseId: string,
    message: string,
    sessionId: string = this.generateSessionId()
  ): Promise<AIBuddyResponse> {
    this.logger.log(`AI Buddy chat - User: ${userId}, Course: ${courseId}, Session: ${sessionId}`);

    try {
      // Step 1: Configure vector search for course content
      const config: AIBuddyConfig = {
        courseId,
        embeddingModel: 'text-embedding-3-small',
        similarityThreshold: 0.7,
        maxResults: 10,
        fallbackMessage: "I don't know that, sorry can't help with that"
      };

      // Store user message
      await this.storeChatMessage({
        courseId,
        userId,
        sessionId,
        message,
        isUserMessage: true,
      });

      // Step 1: Configure vector search for course content
      const similarContent = await this.embeddingsService.searchSimilarContent(
        message,
        courseId,
        config.similarityThreshold,
        config.maxResults
      );

      let response: string;
      let sources: any[] = [];

      // Step 4: Handle "no results found" scenarios
      if (similarContent.length === 0) {
        this.logger.warn(`No relevant content found for query: ${message}`);
        response = config.fallbackMessage;
      } else {
        // Step 3: Implement context-aware responses
        const contextContent = await this.buildContextFromResults(similarContent);
        response = await this.generateContextAwareResponse(message, contextContent, courseId);
        sources = similarContent;
      }

      // Store AI response with embedding results
      await this.storeChatMessage({
        courseId,
        userId,
        sessionId,
        message: response,
        isUserMessage: false,
        embeddingResults: sources,
      });

      return {
        response,
        sources,
        tokensUsed: this.estimateTokenUsage(message + response),
        remainingTokens: 10000, // TODO: Implement actual token tracking
      };

    } catch (error) {
      this.logger.error(`AI Buddy chat failed for user ${userId}:`, error);

      // Store error response
      await this.storeChatMessage({
        courseId,
        userId,
        sessionId,
        message: this.fallbackMessage,
        isUserMessage: false,
      });

      return {
        response: this.fallbackMessage,
        sources: [],
      };
    }
  }

  /**
   * Generate AI response using OpenAI with context
   */
  private async generateAIResponse(
    userQuery: string,
    contextContent: string,
    courseId: string
  ): Promise<string> {
    const systemPrompt = [
      'You are an AI teaching assistant for an online course.',
      'Your role is to help students understand course content by answering their questions.',
      'You have access to course materials including lecture content, transcripts, and study materials.',
      '',
      'Guidelines:',
      '- Answer questions based only on the provided course content',
      '- Be helpful, clear, and educational',
      '- If the question is not covered in the course materials, politely say you don\'t have that information',
      '- Encourage students to ask follow-up questions',
      '- Use examples from the course materials when possible',
      '',
      'Course materials provided below:',
      '---',
      contextContent || 'No specific course materials found for this query.',
      '---'
    ].join('\n');

    const userPrompt = [
      `Student question: ${userQuery}`,
      '',
      'Please provide a helpful response based on the course materials above.',
    ].join('\n');

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 800,
        temperature: 0.7,
      });

      return response.choices[0]?.message?.content || this.fallbackMessage;
    } catch (error) {
      this.logger.error('OpenAI API call failed:', error);
      return this.fallbackMessage;
    }
  }

  /**
   * Step 3: Implement context-aware responses - Phase 3.4
   */
  private async generateContextAwareResponse(
    userQuery: string,
    contextContent: string,
    courseId: string
  ): Promise<string> {
    const systemPrompt = [
      'You are an AI teaching assistant for an online course.',
      'Your role is to help students understand course content by answering their questions.',
      'You have access to course materials including lecture content, transcripts, and study materials.',
      '',
      'Guidelines:',
      '- Answer questions based only on the provided course content',
      '- Be helpful, clear, and educational',
      '- If the question is not covered in the course materials, politely say you don\'t have that information',
      '- Encourage students to ask follow-up questions',
      '- Use examples from the course materials when possible',
      '- Provide context-aware responses that reference specific course content',
      '- Break down complex concepts into understandable explanations',
      '',
      'Course materials provided below:',
      '---',
      contextContent || 'No specific course materials found for this query.',
      '---'
    ].join('\n');

    const userPrompt = [
      `Student question: ${userQuery}`,
      '',
      'Please provide a helpful, context-aware response based on the course materials above.',
      'Reference specific content from the materials when relevant.',
    ].join('\n');

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 800,
        temperature: 0.7,
      });

      return response.choices[0]?.message?.content || this.fallbackMessage;
    } catch (error) {
      this.logger.error('OpenAI API call failed:', error);
      return this.fallbackMessage;
    }
  }

  /**
   * Build context content from embedding search results
   */
  private async buildContextFromResults(results: any[]): Promise<string> {
    const contentPieces: string[] = [];

    for (const result of results) {
      // In a real implementation, you'd retrieve the actual content
      // For now, we'll use the content hash as a placeholder
      const content = await this.embeddingsService.getContentByHash(result.content_hash);
      if (content) {
        contentPieces.push(`[${result.kind}] ${content.substring(0, 500)}...`);
      }
    }

    return contentPieces.join('\n\n');
  }

  /**
   * Store chat message in database
   */
  private async storeChatMessage(data: {
    courseId: string;
    userId: string;
    sessionId: string;
    message: string;
    isUserMessage: boolean;
    response?: string;
    embeddingResults?: any[];
  }): Promise<void> {
    try {
      const chatMessage = {
        course_id: data.courseId,
        user_id: data.userId,
        session_id: data.sessionId,
        message: data.message,
        is_user_message: data.isUserMessage,
        response: data.response,
        embedding_results: data.embeddingResults ? JSON.stringify(data.embeddingResults) : null,
      };

      await this.chatRepository.save(chatMessage);
    } catch (error) {
      this.logger.error('Failed to store chat message:', error);
    }
  }

  /**
   * Get chat history for a session
   */
  async getChatHistory(
    courseId: string,
    userId: string,
    sessionId: string,
    limit: number = 50
  ): Promise<AIBuddyChatMessage[]> {
    try {
      const messages = await this.chatRepository.find({
        where: {
          course_id: courseId,
          user_id: userId,
          session_id: sessionId,
        },
        order: { created_at: 'ASC' },
        take: limit,
      });

      return messages.map(msg => ({
        id: msg.id,
        courseId: msg.course_id,
        userId: msg.user_id,
        sessionId: msg.session_id,
        message: msg.message,
        isUserMessage: msg.is_user_message,
        response: msg.response,
        embeddingResults: msg.embedding_results ? JSON.parse(msg.embedding_results) : [],
        timestamp: msg.created_at,
      }));
    } catch (error) {
      this.logger.error('Failed to get chat history:', error);
      return [];
    }
  }

  /**
   * Get recent chat sessions for a user and course
   */
  async getRecentSessions(
    courseId: string,
    userId: string,
    limit: number = 10
  ): Promise<string[]> {
    try {
      const sessions = await this.chatRepository
        .createQueryBuilder('chat')
        .select('DISTINCT chat.session_id', 'session_id')
        .where('chat.course_id = :courseId', { courseId })
        .andWhere('chat.user_id = :userId', { userId })
        .orderBy('MAX(chat.created_at)', 'DESC')
        .groupBy('chat.session_id')
        .limit(limit)
        .getRawMany();

      return sessions.map(s => s.session_id);
    } catch (error) {
      this.logger.error('Failed to get recent sessions:', error);
      return [];
    }
  }

  /**
   * Generate a unique session ID
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Estimate token usage (rough calculation)
   */
  private estimateTokenUsage(text: string): number {
    // Rough estimation: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }

  /**
   * Check if user has access to the course
   */
  async checkCourseAccess(userId: string, courseId: string): Promise<boolean> {
    // This should integrate with your enrollment system
    // For now, return true as a placeholder
    return true;
  }

  /**
   * Initialize AI buddy for a course (called after content generation)
   */
  async initializeAIBuddyForCourse(courseId: string): Promise<void> {
    this.logger.log(`Initializing AI Buddy for course: ${courseId}`);

    try {
      // Any initialization logic can go here
      // For example, pre-computing common question responses

      this.logger.log(`AI Buddy initialized for course: ${courseId}`);
    } catch (error) {
      this.logger.error(`Failed to initialize AI Buddy for course ${courseId}:`, error);
      throw error;
    }
  }
}