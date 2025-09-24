import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VectorEmbedding } from '../entities/vector-embedding.entity';
import { OpenAIService } from './openai.service';

export interface RAGSearchResult {
  content: string;
  title?: string;
  description?: string;
  content_type: string;
  similarity_score: number;
  metadata?: Record<string, any>;
}

@Injectable()
export class RAGService {
  private readonly logger = new Logger(RAGService.name);

  constructor(
    @InjectRepository(VectorEmbedding)
    private vectorEmbeddingRepository: Repository<VectorEmbedding>,
    private openaiService: OpenAIService,
  ) {}

  /**
   * Store content with its embedding in the vector database
   */
  async storeContent(
    courseId: string,
    contentType: string,
    contentText: string,
    contentId?: string,
    title?: string,
    description?: string,
    metadata?: Record<string, any>,
  ): Promise<VectorEmbedding> {
    this.logger.log(`Storing content for course: ${courseId}, type: ${contentType}`);

    try {
      // Generate embedding for the content
      const embedding = await this.openaiService.generateEmbeddings(contentText);

      // Create vector embedding record
      const vectorEmbedding = this.vectorEmbeddingRepository.create({
        course_id: courseId,
        content_id: contentId,
        content_type: contentType as any,
        content_text: contentText,
        embedding: JSON.stringify(embedding),
        title,
        description,
        metadata,
      });

      const saved = await this.vectorEmbeddingRepository.save(vectorEmbedding);
      this.logger.log(`Content stored successfully with ID: ${saved.id}`);
      
      return saved;
    } catch (error) {
      this.logger.error('Failed to store content:', error);
      throw error;
    }
  }

  /**
   * Search for similar content using vector similarity
   */
  async searchSimilarContent(
    courseId: string,
    query: string,
    limit: number = 5,
    contentType?: string,
  ): Promise<RAGSearchResult[]> {
    this.logger.log(`Searching similar content for course: ${courseId}`);

    try {
      // Generate embedding for the query
      const queryEmbedding = await this.openaiService.generateEmbeddings(query);

      // Build the similarity search query
      let queryBuilder = this.vectorEmbeddingRepository
        .createQueryBuilder('ve')
        .select([
          've.content_text',
          've.title',
          've.description',
          've.content_type',
          've.metadata',
          `1 - (ve.embedding <=> :queryEmbedding) as similarity_score`,
        ])
        .where('ve.course_id = :courseId', { courseId })
        .andWhere('ve.is_active = :isActive', { isActive: true })
        .setParameter('queryEmbedding', `[${queryEmbedding.join(',')}]`)
        .orderBy('ve.embedding <=> :queryEmbedding', 'ASC')
        .limit(limit);

      if (contentType) {
        queryBuilder = queryBuilder.andWhere('ve.content_type = :contentType', { contentType });
      }

      const results = await queryBuilder.getRawMany();

      return results.map(result => ({
        content: result.ve_content_text,
        title: result.ve_title,
        description: result.ve_description,
        content_type: result.ve_content_type,
        similarity_score: parseFloat(result.similarity_score),
        metadata: result.ve_metadata,
      }));
    } catch (error) {
      this.logger.error('Failed to search similar content:', error);
      throw error;
    }
  }

  /**
   * Get context for AI Buddy using RAG
   */
  async getContextForAIBuddy(
    courseId: string,
    question: string,
    maxResults: number = 3,
  ): Promise<string> {
    this.logger.log(`Getting context for AI Buddy, course: ${courseId}`);

    try {
      const searchResults = await this.searchSimilarContent(
        courseId,
        question,
        maxResults,
      );

      if (searchResults.length === 0) {
        return `Course ID: ${courseId}. No specific content found for this question.`;
      }

      let context = `Course Context for AI Buddy (Course ID: ${courseId}):\n\n`;
      
      searchResults.forEach((result, index) => {
        context += `Relevant Content ${index + 1} (${result.content_type}):\n`;
        if (result.title) {
          context += `Title: ${result.title}\n`;
        }
        context += `Content: ${result.content}\n`;
        if (result.description) {
          context += `Description: ${result.description}\n`;
        }
        context += `Relevance Score: ${(result.similarity_score * 100).toFixed(1)}%\n\n`;
      });

      return context;
    } catch (error) {
      this.logger.error('Failed to get context for AI Buddy:', error);
      return `Course ID: ${courseId}. Error retrieving context.`;
    }
  }

  /**
   * Update content embedding
   */
  async updateContentEmbedding(
    embeddingId: string,
    newContentText: string,
  ): Promise<VectorEmbedding> {
    this.logger.log(`Updating content embedding: ${embeddingId}`);

    try {
      const embedding = await this.vectorEmbeddingRepository.findOne({
        where: { id: embeddingId },
      });

      if (!embedding) {
        throw new Error('Vector embedding not found');
      }

      // Generate new embedding
      const newEmbedding = await this.openaiService.generateEmbeddings(newContentText);

      // Update the record
      embedding.content_text = newContentText;
      embedding.embedding = JSON.stringify(newEmbedding);
      embedding.updated_at = new Date();

      const updated = await this.vectorEmbeddingRepository.save(embedding);
      this.logger.log(`Content embedding updated successfully`);
      
      return updated;
    } catch (error) {
      this.logger.error('Failed to update content embedding:', error);
      throw error;
    }
  }

  /**
   * Delete content embedding
   */
  async deleteContentEmbedding(embeddingId: string): Promise<void> {
    this.logger.log(`Deleting content embedding: ${embeddingId}`);

    try {
      await this.vectorEmbeddingRepository.delete(embeddingId);
      this.logger.log(`Content embedding deleted successfully`);
    } catch (error) {
      this.logger.error('Failed to delete content embedding:', error);
      throw error;
    }
  }

  /**
   * Get embeddings by course and content type
   */
  async getEmbeddingsByCourse(
    courseId: string,
    contentType?: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<{ embeddings: VectorEmbedding[]; total: number }> {
    this.logger.log(`Getting embeddings for course: ${courseId}`);

    try {
      let queryBuilder = this.vectorEmbeddingRepository
        .createQueryBuilder('ve')
        .where('ve.course_id = :courseId', { courseId })
        .andWhere('ve.is_active = :isActive', { isActive: true })
        .orderBy('ve.created_at', 'DESC');

      if (contentType) {
        queryBuilder = queryBuilder.andWhere('ve.content_type = :contentType', { contentType });
      }

      const [embeddings, total] = await queryBuilder
        .skip((page - 1) * limit)
        .take(limit)
        .getManyAndCount();

      return { embeddings, total };
    } catch (error) {
      this.logger.error('Failed to get embeddings by course:', error);
      throw error;
    }
  }

  /**
   * Batch store multiple content items
   */
  async batchStoreContent(
    courseId: string,
    contentItems: Array<{
      contentType: string;
      contentText: string;
      contentId?: string;
      title?: string;
      description?: string;
      metadata?: Record<string, any>;
    }>,
  ): Promise<VectorEmbedding[]> {
    this.logger.log(`Batch storing ${contentItems.length} content items for course: ${courseId}`);

    try {
      const embeddings: VectorEmbedding[] = [];

      for (const item of contentItems) {
        const embedding = await this.storeContent(
          courseId,
          item.contentType,
          item.contentText,
          item.contentId,
          item.title,
          item.description,
          item.metadata,
        );
        embeddings.push(embedding);
      }

      this.logger.log(`Batch storage completed successfully`);
      return embeddings;
    } catch (error) {
      this.logger.error('Failed to batch store content:', error);
      throw error;
    }
  }

  /**
   * Generate embeddings for content (for queue processor)
   */
  async generateEmbeddings(courseId: string, content: string): Promise<void> {
    this.logger.log(`Generating embeddings for course: ${courseId}`);
    
    try {
      await this.storeContent(
        courseId,
        'course_content',
        content,
        `content_${Date.now()}`,
        'Course Content',
        'Generated course content',
        { generated_at: new Date().toISOString() }
      );
      
      this.logger.log(`Embeddings generated successfully for course: ${courseId}`);
    } catch (error) {
      this.logger.error(`Failed to generate embeddings for course ${courseId}:`, error);
      throw error;
    }
  }

  /**
   * Process AI Buddy conversation using RAG
   */
  async processAIBuddyConversation(context: string, message: string): Promise<string> {
    this.logger.log(`Processing AI Buddy conversation for context: ${context}`);
    
    try {
      // Get relevant context from vector database
      const contextString = await this.getContextForAIBuddy(context, message, 5);
      
      // Generate response using OpenAI with context
      const prompt = `You are an AI tutor for the course "${context}". 
      
Context from course materials:
${contextString}

Student question: ${message}

Please provide a helpful, educational response based on the course materials. Be friendly and encouraging.`;

      const response = await this.openaiService.generateText(prompt, {
        maxTokens: 500,
        temperature: 0.7,
      });
      
      return response;
    } catch (error) {
      this.logger.error('Failed to process AI Buddy conversation:', error);
      throw error;
    }
  }
}
