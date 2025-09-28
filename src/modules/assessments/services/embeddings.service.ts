import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import * as fs from 'fs-extra';
import * as path from 'path';
import { VectorEmbedding } from '../../ai/entities/vector-embedding.entity';
import { Course } from '../../courses/entities/course.entity';
import { CourseSection } from '../../courses/entities/course-section.entity';
import { CourseSubtopic } from '../../courses/entities/course-subtopic.entity';
import getOpenAIConfig from '../../../config/openai.config';

@Injectable()
export class EmbeddingsService {
  private readonly logger = new Logger(EmbeddingsService.name);
  private readonly openai: OpenAI;

  constructor(
    @InjectRepository(VectorEmbedding)
    private embeddingRepository: Repository<VectorEmbedding>,
    @InjectRepository(Course)
    private courseRepository: Repository<Course>,
    @InjectRepository(CourseSection)
    private sectionRepository: Repository<CourseSection>,
    @InjectRepository(CourseSubtopic)
    private subtopicRepository: Repository<CourseSubtopic>,
    private configService: ConfigService,
  ) {
    const ai = getOpenAIConfig(this.configService);
    this.openai = new OpenAI({ apiKey: ai.apiKey });
  }

  /**
   * Compute and store embeddings for a course
   */
  async computeAndStoreEmbeddings(courseId: string): Promise<void> {
    this.logger.log(`Computing embeddings for course ${courseId}`);

    const course = await this.courseRepository.findOne({ where: { id: courseId } });
    if (!course) {
      throw new Error(`Course ${courseId} not found`);
    }

    // Get all sections for this course
    const sections = await this.sectionRepository.find({
      where: { course_id: courseId },
      order: { index: 'ASC' },
    });

    // Process each section
    for (const section of sections) {
      await this.processSectionEmbeddings(courseId, section);
    }

    // Process course-level embedding
    await this.processCourseEmbedding(courseId, sections);
  }

  /**
   * Process embeddings for a single section
   */
  private async processSectionEmbeddings(courseId: string, section: CourseSection): Promise<void> {
    this.logger.log(`Processing section embeddings for section ${section.id}`);

    // Get all subtopics for this section
    const subtopics = await this.subtopicRepository.find({
      where: { section_id: section.id },
      order: { index: 'ASC' },
    });

    // Read markdown files and concatenate content
    const sectionContent = await this.readSectionContent(courseId, section, subtopics);
    
    if (!sectionContent.trim()) {
      this.logger.warn(`No content found for section ${section.id}`);
      return;
    }

    // Generate embedding
    const embedding = await this.generateEmbedding(sectionContent);
    
    // Store in database
    await this.storeEmbedding({
      course_id: courseId,
      content_id: section.id,
      content_type: 'section',
      content_text: sectionContent,
      embedding: embedding,
    });

    // Also store individual subtopic embeddings
    for (const subtopic of subtopics) {
      await this.processSubtopicEmbedding(courseId, section.id, subtopic);
    }
  }

  /**
   * Process embedding for a single subtopic
   */
  private async processSubtopicEmbedding(
    courseId: string,
    sectionId: string,
    subtopic: CourseSubtopic,
  ): Promise<void> {
    const subtopicContent = await this.readSubtopicContent(courseId, subtopic);
    
    if (!subtopicContent.trim()) {
      this.logger.warn(`No content found for subtopic ${subtopic.id}`);
      return;
    }

    const embedding = await this.generateEmbedding(subtopicContent);
    
    await this.storeEmbedding({
      course_id: courseId,
      content_id: subtopic.id,
      content_type: 'subtopic',
      content_text: subtopicContent,
      embedding: embedding,
    });
  }

  /**
   * Process course-level embedding
   */
  private async processCourseEmbedding(courseId: string, sections: CourseSection[]): Promise<void> {
    this.logger.log(`Processing course-level embedding for course ${courseId}`);

    let courseContent = '';
    
    for (const section of sections) {
      const subtopics = await this.subtopicRepository.find({
        where: { section_id: section.id },
        order: { index: 'ASC' },
      });
      
      const sectionContent = await this.readSectionContent(courseId, section, subtopics);
      courseContent += `\n\n## ${section.title}\n\n${sectionContent}`;
    }

    if (!courseContent.trim()) {
      this.logger.warn(`No content found for course ${courseId}`);
      return;
    }

    const embedding = await this.generateEmbedding(courseContent);
    
    await this.storeEmbedding({
      course_id: courseId,
      content_id: null,
      content_type: 'course',
      content_text: courseContent,
      embedding: embedding,
    });
  }

  /**
   * Read content for a section by concatenating all subtopic markdown files
   */
  private async readSectionContent(
    courseId: string,
    section: CourseSection,
    subtopics: CourseSubtopic[],
  ): Promise<string> {
    let content = section.title || '';
    
    for (const subtopic of subtopics) {
      const subtopicContent = await this.readSubtopicContent(courseId, subtopic);
      if (subtopicContent.trim()) {
        content += `\n\n---\n\n${subtopicContent}`;
      }
    }
    
    return content.trim();
  }

  /**
   * Read markdown content for a subtopic
   */
  private async readSubtopicContent(courseId: string, subtopic: CourseSubtopic): Promise<string> {
    try {
      // Try to read from the generated files structure
      const generatedPath = path.join(process.cwd(), 'generated', courseId, 'sections');
      const sectionDirs = await fs.readdir(generatedPath);
      
      for (const sectionDir of sectionDirs) {
        if (sectionDir.includes(subtopic.title.toLowerCase().replace(/\s+/g, '-'))) {
          const markdownFile = path.join(generatedPath, sectionDir, `${subtopic.title.toLowerCase().replace(/\s+/g, '-')}.md`);
          if (await fs.pathExists(markdownFile)) {
            return await fs.readFile(markdownFile, 'utf-8');
          }
        }
      }
      
              // Fallback: return subtopic title and content
              return `# ${subtopic.title}\n\nContent not yet generated.`;
    } catch (error) {
      this.logger.warn(`Failed to read content for subtopic ${subtopic.id}: ${error.message}`);
      return `# ${subtopic.title}\n\nContent not yet generated.`;
    }
  }

  /**
   * Generate embedding using OpenAI
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await this.openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: text,
      });
      
      return response.data[0].embedding;
    } catch (error) {
      this.logger.error(`Failed to generate embedding: ${error.message}`);
      throw new Error('Failed to generate embedding');
    }
  }

  /**
   * Store embedding in database with upsert logic
   */
  private async storeEmbedding(data: {
    course_id: string;
    content_id: string | null;
    content_type: 'course' | 'section' | 'subtopic';
    content_text: string;
    embedding: number[];
  }): Promise<void> {
    try {
      // Check if embedding already exists
      const existing = await this.embeddingRepository.findOne({
        where: { 
          course_id: data.course_id,
          content_id: data.content_id,
          content_type: data.content_type,
        },
      });

      if (existing) {
        this.logger.log(`Embedding already exists for ${data.content_type} ${data.content_id}`);
        return;
      }

      // Insert new embedding
      await this.embeddingRepository.save({
        course_id: data.course_id,
        content_id: data.content_id,
        content_type: data.content_type,
        content_text: data.content_text,
        embedding: JSON.stringify(data.embedding),
      });

      this.logger.log(`Stored embedding for ${data.content_type} ${data.course_id}`);
    } catch (error) {
      this.logger.error(`Failed to store embedding: ${error.message}`);
      throw error;
    }
  }

  /**
   * Search embeddings by similarity
   */
  async searchEmbeddings(
    queryEmbedding: number[],
    courseId: string,
    similarityThreshold: number = 0.7,
    maxResults: number = 10,
  ): Promise<VectorEmbedding[]> {
    try {
      // Use the database function for vector search
      const results = await this.embeddingRepository.query(
        `SELECT * FROM search_embeddings($1, $2, $3, $4)`,
        [queryEmbedding, courseId, similarityThreshold, maxResults],
      );

      return results;
    } catch (error) {
      this.logger.error(`Failed to search embeddings: ${error.message}`);
      throw new Error('Failed to search embeddings');
    }
  }

}
