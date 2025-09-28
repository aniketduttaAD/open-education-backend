import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import * as crypto from 'crypto';
import * as fs from 'fs-extra';
import { Embeddings } from '../../courses/entities';

interface EmbeddingData {
  courseId: string;
  sectionId?: string;
  subtopicId?: string;
  kind: 'course' | 'section' | 'subtopic';
  content: string;
  contentHash?: string;
}

interface EmbeddingSearchResult {
  id: string;
  content_hash: string;
  similarity: number;
  course_id: string;
  section_id?: string;
  subtopic_id?: string;
  kind: string;
}

@Injectable()
export class EmbeddingsService {
  private readonly logger = new Logger(EmbeddingsService.name);
  private readonly openai: OpenAI;

  constructor(
    private configService: ConfigService,
    @InjectRepository(Embeddings)
    private readonly embeddingsRepository: Repository<Embeddings>,
  ) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
    });
  }

  /**
   * Generate embeddings for course content
   */
  async generateCourseEmbeddings(courseId: string, sections: any[]): Promise<void> {
    this.logger.log(`Starting embedding generation for course: ${courseId}`);

    // Validate inputs
    if (!courseId || !sections || sections.length === 0) {
      this.logger.warn(`Invalid inputs for embedding generation: courseId=${courseId}, sections=${sections?.length}`);
      return;
    }

    try {
      for (const section of sections) {
        if (!section || !section.id || !section.title) {
          this.logger.warn(`Invalid section data: ${JSON.stringify(section)}`);
          continue;
        }

        const subtopics = section.subtopics || [];

        // Collect all content for the section
        let sectionContent = `Section: ${section.title}\n\n`;
        const subtopicContents: string[] = [];

        for (const subtopic of subtopics) {
          if (!subtopic || !subtopic.id || !subtopic.title) {
            this.logger.warn(`Invalid subtopic data: ${JSON.stringify(subtopic)}`);
            continue;
          }

          if (subtopic.markdown_path && await fs.pathExists(subtopic.markdown_path)) {
            try {
              const markdownContent = await fs.readFile(subtopic.markdown_path, 'utf8');
              if (markdownContent && markdownContent.trim().length > 0) {
                subtopicContents.push(markdownContent);

                // Generate subtopic-level embedding
                await this.createEmbedding({
                  courseId,
                  sectionId: section.id,
                  subtopicId: subtopic.id,
                  kind: 'subtopic',
                  content: `${subtopic.title}\n\n${markdownContent}`,
                });
              } else {
                this.logger.warn(`Empty markdown content for subtopic: ${subtopic.id}`);
              }
            } catch (error) {
              this.logger.error(`Failed to read markdown file for subtopic ${subtopic.id}:`, error);
            }
          }

          if (subtopic.transcript_path && await fs.pathExists(subtopic.transcript_path)) {
            try {
              const transcriptContent = await fs.readFile(subtopic.transcript_path, 'utf8');
              if (transcriptContent && transcriptContent.trim().length > 0) {
                // Also create embedding for transcript
                await this.createEmbedding({
                  courseId,
                  sectionId: section.id,
                  subtopicId: subtopic.id,
                  kind: 'subtopic',
                  content: `${subtopic.title} Transcript\n\n${transcriptContent}`,
                });
              } else {
                this.logger.warn(`Empty transcript content for subtopic: ${subtopic.id}`);
              }
            } catch (error) {
              this.logger.error(`Failed to read transcript file for subtopic ${subtopic.id}:`, error);
            }
          }
        }

        // Combine all subtopic content for section-level embedding
        if (subtopicContents.length > 0) {
          sectionContent += subtopicContents.join('\n\n---\n\n');

          await this.createEmbedding({
            courseId,
            sectionId: section.id,
            kind: 'section',
            content: sectionContent,
          });
        }
      }

      // Create course-level embedding by combining all sections
      const allSections = sections.map(s => s.title).join(', ');
      await this.createEmbedding({
        courseId,
        kind: 'course',
        content: `Course sections: ${allSections}`,
      });

      this.logger.log(`Completed embedding generation for course: ${courseId}`);
    } catch (error) {
      this.logger.error(`Failed to generate embeddings for course ${courseId}:`, error);
      throw error;
    }
  }

  /**
   * Create a single embedding and store it
   */
  private async createEmbedding(data: EmbeddingData): Promise<void> {
    try {
      // Validate input data
      if (!data.courseId || !data.kind || !data.content || data.content.trim().length === 0) {
        this.logger.warn(`Invalid embedding data: ${JSON.stringify(data)}`);
        return;
      }

      // Generate content hash to avoid duplicates
      const contentHash = crypto.createHash('sha256').update(data.content).digest('hex');

      // Check if embedding already exists
      const existingEmbedding = await this.embeddingsRepository.findOne({
        where: { content_hash: contentHash }
      });

      if (existingEmbedding) {
        this.logger.debug(`Embedding already exists for content hash: ${contentHash}`);
        return;
      }

      // Generate embedding using OpenAI with retry logic
      let response;
      let retryCount = 0;
      const maxRetries = 3;

      while (retryCount < maxRetries) {
        try {
          response = await this.openai.embeddings.create({
            model: 'text-embedding-3-small',
            input: data.content,
            encoding_format: 'float',
          });
          break;
        } catch (error) {
          retryCount++;
          if (retryCount >= maxRetries) {
            throw error;
          }
          this.logger.warn(`OpenAI API call failed, retrying (${retryCount}/${maxRetries}):`, error);
          await new Promise(resolve => setTimeout(resolve, 1000 * retryCount)); // Exponential backoff
        }
      }

      if (!response || !response.data || !response.data[0] || !response.data[0].embedding) {
        throw new Error('Invalid response from OpenAI embeddings API');
      }

      const embedding = response.data[0].embedding;

      // Validate embedding dimensions
      if (!Array.isArray(embedding) || embedding.length !== 1536) {
        throw new Error(`Invalid embedding dimensions: expected 1536, got ${embedding.length}`);
      }

      // Store in database
      const embeddingEntity = this.embeddingsRepository.create({
        course_id: data.courseId,
        section_id: data.sectionId,
        subtopic_id: data.subtopicId,
        kind: data.kind,
        content_hash: contentHash,
        embedding: JSON.stringify(embedding), // Convert to JSON for storage
      });

      await this.embeddingsRepository.save(embeddingEntity);

      this.logger.debug(`Created embedding for ${data.kind}: ${data.courseId}`);
    } catch (error) {
      this.logger.error(`Failed to create embedding:`, error);
      throw error;
    }
  }

  /**
   * Search for similar content using vector similarity
   */
  async searchSimilarContent(
    query: string,
    courseId: string,
    similarityThreshold: number = 0.7,
    maxResults: number = 10
  ): Promise<EmbeddingSearchResult[]> {
    try {
      // Generate embedding for the query
      const response = await this.openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: query,
        encoding_format: 'float',
      });

      const queryEmbedding = response.data[0].embedding;

      // Use the PostgreSQL function for similarity search
      const results = await this.embeddingsRepository.query(`
        SELECT
          id,
          course_id,
          section_id,
          subtopic_id,
          kind,
          content_hash,
          similarity,
          created_at
        FROM search_embeddings($1, $2, $3, $4)
      `, [
        JSON.stringify(queryEmbedding),
        courseId,
        similarityThreshold,
        maxResults
      ]);

      return results;
    } catch (error) {
      this.logger.error(`Failed to search similar content:`, error);
      throw error;
    }
  }

  /**
   * Get content by content hash for AI responses
   */
  async getContentByHash(contentHash: string): Promise<string | null> {
    try {
      const embedding = await this.embeddingsRepository.findOne({
        where: { content_hash: contentHash }
      });
      
      if (!embedding) {
        this.logger.warn(`No embedding found for content hash: ${contentHash}`);
        return null;
      }
      
      // Return a description of the content based on the embedding metadata
      const contentDescription = this.buildContentDescription(embedding);
      return contentDescription;
    } catch (error) {
      this.logger.error(`Failed to get content by hash:`, error);
      return null;
    }
  }

  /**
   * Build content description from embedding metadata
   */
  private buildContentDescription(embedding: any): string {
    const kind = embedding.kind;
    const courseId = embedding.course_id;
    const sectionId = embedding.section_id;
    const subtopicId = embedding.subtopic_id;
    
    switch (kind) {
      case 'course':
        return `Course content for course ID: ${courseId}`;
      case 'section':
        return `Section content for course ID: ${courseId}, section ID: ${sectionId}`;
      case 'subtopic':
        return `Subtopic content for course ID: ${courseId}, section ID: ${sectionId}, subtopic ID: ${subtopicId}`;
      default:
        return `Content for course ID: ${courseId}`;
    }
  }

  /**
   * Delete all embeddings for a course
   */
  async deleteCourseEmbeddings(courseId: string): Promise<void> {
    try {
      await this.embeddingsRepository.delete({ course_id: courseId });
      this.logger.log(`Deleted embeddings for course: ${courseId}`);
    } catch (error) {
      this.logger.error(`Failed to delete embeddings for course ${courseId}:`, error);
      throw error;
    }
  }
}