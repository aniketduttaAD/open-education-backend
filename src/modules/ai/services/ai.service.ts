import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fs from 'fs-extra';
import * as path from 'path';
import { OpenAIService } from './openai.service';
import { VideoGenerationService } from './video-generation.service';
import { RAGService } from './rag.service';
import { AIBuddyUsage } from '../entities';
import { StudentTokenAllocation } from '../../users/entities';
import { CourseSubtopic } from '../../courses/entities/course-subtopic.entity';
import { CourseTopic } from '../../courses/entities/course-topic.entity';
import { QueueService } from '../../queue/services/queue.service';

/**
 * AI service for managing AI-powered features and content generation
 */
@Injectable()
export class AIService {
  private readonly logger = new Logger(AIService.name);

  constructor(
    @InjectRepository(AIBuddyUsage)
    private aiBuddyUsageRepository: Repository<AIBuddyUsage>,
    @InjectRepository(StudentTokenAllocation)
    private studentTokenAllocationRepository: Repository<StudentTokenAllocation>,
    @InjectRepository(CourseSubtopic)
    private courseSubtopicRepository: Repository<CourseSubtopic>,
    @InjectRepository(CourseTopic)
    private courseTopicRepository: Repository<CourseTopic>,
    private openaiService: OpenAIService,
    // LangChain removed
    private videoGenerationService: VideoGenerationService,
    private ragService: RAGService,
    private queueService: QueueService,
  ) {}

  /**
   * Generate course roadmap using AI
   */
  async generateCourseRoadmap(
    courseTitle: string,
    courseDescription: string,
    level: string,
  ): Promise<{ topics: Array<{ title: string; description: string; order: number }> }> {
    this.logger.log(`Generating course roadmap for: ${courseTitle}`);

    try {
      // Use OpenAI directly for course roadmap generation
      const response = await this.openaiService.generateCourseRoadmap(
        courseTitle,
        courseDescription,
        level,
      );

      return response;
    } catch (error) {
      this.logger.error('Failed to generate course roadmap:', error);
      throw new BadRequestException('Failed to generate course roadmap');
    }
  }

  /**
   * Generate course content for a topic
   */
  async generateTopicContent(
    topicTitle: string,
    topicDescription: string,
    courseContext: string,
  ): Promise<{
    slides: Array<{ title: string; content: string; order: number }>;
    transcript: string;
  }> {
    this.logger.log(`Generating content for topic: ${topicTitle}`);

    try {
      const response = await this.openaiService.generateTopicContent(
        topicTitle,
        topicDescription,
        courseContext,
      );

      return response;
    } catch (error) {
      this.logger.error('Failed to generate topic content:', error);
      throw new BadRequestException('Failed to generate topic content');
    }
  }

  /**
   * Generate quiz questions for a topic
   */
  async generateQuizQuestions(
    topicTitle: string,
    content: string,
    difficulty: string = 'intermediate',
    questionCount: number = 5,
  ): Promise<{
    questions: Array<{
      question: string;
      options: string[];
      correct_answer: number;
      explanation: string;
    }>;
  }> {
    this.logger.log(`Generating quiz questions for topic: ${topicTitle}`);

    try {
      const response = await this.openaiService.generateQuizQuestions(
        content,
        topicTitle,
        difficulty,
        questionCount,
      );

      return response;
    } catch (error) {
      this.logger.error('Failed to generate quiz questions:', error);
      throw new BadRequestException('Failed to generate quiz questions');
    }
  }

  /**
   * Get course context for AI Buddy using RAG
   */
  async getCourseContext(courseId: string, question?: string): Promise<string> {
    try {
      if (question) {
        // Use RAG to get relevant context for the specific question
        return await this.ragService.getContextForAIBuddy(courseId, question);
      }
      
      // Return basic course context if no specific question
      return `Course ID: ${courseId}. This is a course-specific AI assistant that can help with course-related questions, explanations, and learning support.`;
    } catch (error) {
      this.logger.error(`Failed to get course context for course ${courseId}:`, error);
      return `Course ID: ${courseId}`;
    }
  }

  /**
   * Chat with AI Buddy (course-specific)
   */
  async chatWithAIBuddy(
    userId: string,
    courseId: string,
    message: string,
    courseContext?: string,
    conversationHistory: Array<{ role: string; content: string }> = [],
  ): Promise<{
    response: string;
    tokensUsed: number;
    remainingTokens: number;
  }> {
    this.logger.log(`Processing AI Buddy chat for user: ${userId}, course: ${courseId}`);

    // Get course context if not provided, using RAG for better context
    const context = courseContext || await this.getCourseContext(courseId, message);

    // Check token allocation
    const tokenAllocation = await this.getTokenAllocation(userId, courseId);
    if (tokenAllocation.tokens_remaining <= 0) {
      throw new BadRequestException('No tokens remaining for this course');
    }

    try {
      const startTime = Date.now();
      
      // Use RAG service for AI buddy conversation
      const response = await this.ragService.processAIBuddyConversation(
        context,
        message,
      );

      const endTime = Date.now();
      const responseTime = endTime - startTime;

      // Estimate tokens used (rough calculation)
      const tokensUsed = Math.ceil((message.length + response.length) / 4);

      // Update token usage
      await this.updateTokenUsage(userId, courseId, tokensUsed);

      // Save conversation to database
      await this.saveAIBuddyUsage({
        user_id: userId,
        course_id: courseId,
        conversation_type: 'course_help',
        user_message: message,
        ai_response: response,
        tokens_used: tokensUsed,
        response_time_ms: responseTime,
      });

      const updatedAllocation = await this.getTokenAllocation(userId, courseId);

      this.logger.log('AI Buddy chat processed successfully');
      return {
        response,
        tokensUsed,
        remainingTokens: updatedAllocation.tokens_remaining,
      };
    } catch (error) {
      this.logger.error('Failed to process AI Buddy chat:', error);
      throw new BadRequestException('Failed to process AI Buddy chat');
    }
  }

  /**
   * Generate embeddings for course content
   */
  async generateEmbeddings(text: string): Promise<number[]> {
    this.logger.log('Generating embeddings for text');

    try {
      const embeddings = await this.openaiService.generateEmbeddings(text);
      return embeddings;
    } catch (error) {
      this.logger.error('Failed to generate embeddings:', error);
      throw new BadRequestException('Failed to generate embeddings');
    }
  }

  /**
   * Store content with embeddings for RAG
   */
  async storeContentForRAG(
    courseId: string,
    contentType: string,
    contentText: string,
    contentId?: string,
    title?: string,
    description?: string,
    metadata?: Record<string, any>,
  ) {
    this.logger.log(`Storing content for RAG: course ${courseId}, type ${contentType}`);

    try {
      return await this.ragService.storeContent(
        courseId,
        contentType,
        contentText,
        contentId,
        title,
        description,
        metadata,
      );
    } catch (error) {
      this.logger.error('Failed to store content for RAG:', error);
      throw new BadRequestException('Failed to store content for RAG');
    }
  }

  /**
   * Search similar content using RAG
   */
  async searchSimilarContent(
    courseId: string,
    query: string,
    limit: number = 5,
    contentType?: string,
  ) {
    this.logger.log(`Searching similar content: course ${courseId}`);

    try {
      return await this.ragService.searchSimilarContent(
        courseId,
        query,
        limit,
        contentType,
      );
    } catch (error) {
      this.logger.error('Failed to search similar content:', error);
      throw new BadRequestException('Failed to search similar content');
    }
  }

  /**
   * Generate TTS audio for course content
   */
  async generateTTS(
    text: string,
    options: {
      voice?: string;
      speed?: number;
    } = {},
  ): Promise<Buffer> {
    this.logger.log('Generating TTS audio');

    try {
      const audioBuffer = await this.openaiService.generateTTS(text, options);
      return audioBuffer;
    } catch (error) {
      this.logger.error('Failed to generate TTS audio:', error);
      throw new BadRequestException('Failed to generate TTS audio');
    }
  }

  /**
   * Get AI Buddy usage history
   */
  async getAIBuddyUsageHistory(
    userId: string,
    courseId: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<{ usage: AIBuddyUsage[]; total: number }> {
    this.logger.log(`Getting AI Buddy usage history for user: ${userId}, course: ${courseId}`);

    const [usage, total] = await this.aiBuddyUsageRepository.findAndCount({
      where: { user_id: userId, course_id: courseId },
      order: { created_at: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { usage, total };
  }

  /**
   * Get token allocation for user and course
   */
  private async getTokenAllocation(userId: string, courseId: string): Promise<StudentTokenAllocation> {
    let allocation = await this.studentTokenAllocationRepository.findOne({
      where: { user_id: userId, course_id: courseId },
    });

    if (!allocation) {
      // Create new allocation
      allocation = this.studentTokenAllocationRepository.create({
        user_id: userId,
        course_id: courseId,
        tokens_allocated: 1000,
        tokens_used: 0,
        tokens_remaining: 1000,
        allocation_month: new Date(),
        reset_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
        is_reset: false,
      });

      allocation = await this.studentTokenAllocationRepository.save(allocation);
    }

    // Check if allocation needs reset
    if (new Date() >= allocation.reset_date && !allocation.is_reset) {
      allocation.tokens_used = 0;
      allocation.tokens_remaining = allocation.tokens_allocated;
      allocation.allocation_month = new Date();
      allocation.reset_date = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      allocation.is_reset = true;

      allocation = await this.studentTokenAllocationRepository.save(allocation);
    }

    return allocation;
  }

  /**
   * Update token usage
   */
  private async updateTokenUsage(userId: string, courseId: string, tokensUsed: number): Promise<void> {
    const allocation = await this.getTokenAllocation(userId, courseId);
    
    allocation.tokens_used += tokensUsed;
    allocation.tokens_remaining = Math.max(0, allocation.tokens_remaining - tokensUsed);

    await this.studentTokenAllocationRepository.save(allocation);
  }

  /**
   * Save AI Buddy usage to database
   */
  private async saveAIBuddyUsage(usageData: Partial<AIBuddyUsage>): Promise<void> {
    const usage = this.aiBuddyUsageRepository.create(usageData);
    await this.aiBuddyUsageRepository.save(usage);
  }

  /**
   * Get AI service health status
   */
  async getHealthStatus(): Promise<{
    openai: boolean;
    rag: boolean;
    status: string;
  }> {
    this.logger.log('Checking AI service health status');

    try {
      // Test OpenAI connection
      await this.openaiService.generateText('Test connection', { maxTokens: 10 });
      
      // Test RAG service
      await this.ragService.processAIBuddyConversation(
        'Test course',
        'Test question',
      );

      return {
        openai: true,
        rag: true,
        status: 'healthy',
      };
    } catch (error) {
      this.logger.error('AI service health check failed:', error);
      return {
        openai: false,
        rag: false,
        status: 'unhealthy',
      };
    }
  }

  /**
   * Generate video for course topic
   */
  async generateTopicVideo(
    courseId: string,
    topicId: string,
    videoData: {
      title: string;
      content: string;
      learningObjectives: string[];
      keyPoints: string[];
    },
  ): Promise<{
    videoPath: string;
    videoUrl: string;
    duration: number;
    slidesCount: number;
  }> {
    this.logger.log(`Generating video for topic: ${videoData.title}`);

    try {
      const result = await this.videoGenerationService.generateCourseVideo(videoData);
      
      this.logger.log(`Video generated successfully for topic: ${videoData.title}`);
      return result;
    } catch (error) {
      this.logger.error('Failed to generate topic video:', error);
      throw new BadRequestException('Failed to generate topic video');
    }
  }

  /**
   * Generate complete course video
   */
  async generateCourseVideo(
    courseId: string,
    courseData: {
      title: string;
      description: string;
      topics: Array<{
        title: string;
        content: string;
        learningObjectives: string[];
        keyPoints: string[];
      }>;
    },
  ): Promise<{
    videos: Array<{
      topicTitle: string;
      videoPath: string;
      videoUrl: string;
      duration: number;
      slidesCount: number;
    }>;
    totalDuration: number;
    totalSlides: number;
  }> {
    this.logger.log(`Generating complete course video for: ${courseData.title}`);

    try {
      const videos = [];
      let totalDuration = 0;
      let totalSlides = 0;

      for (const topic of courseData.topics) {
        const videoResult = await this.videoGenerationService.generateCourseVideo(topic);
        
        videos.push({
          topicTitle: topic.title,
          ...videoResult,
        });
        
        totalDuration += videoResult.duration;
        totalSlides += videoResult.slidesCount;
      }

      this.logger.log(`Complete course video generated successfully for: ${courseData.title}`);
      
      return {
        videos,
        totalDuration,
        totalSlides,
      };
    } catch (error) {
      this.logger.error('Failed to generate course video:', error);
      throw new BadRequestException('Failed to generate course video');
    }
  }

  // ===== QUEUE PROCESSOR METHODS =====

  /**
   * Generate slides using AI (for queue processor)
   */
  async generateSlides(content: string): Promise<string[]> {
    this.logger.log('Generating slides from content');
    
    try {
      const prompt = `Create educational slides for the following content. Return each slide as a separate markdown section with ## Slide Title format:

${content}

Generate 5-8 slides that cover the key concepts clearly and concisely.`;

      const response = await this.openaiService.generateText(prompt, {
        maxTokens: 2000,
        temperature: 0.7,
      });

      // Parse slides from response
      const slides = response.split('##').slice(1).map(slide => slide.trim());
      return slides;
    } catch (error) {
      this.logger.error('Failed to generate slides:', error);
      throw new BadRequestException('Failed to generate slides');
    }
  }

  /**
   * Convert slides to images using Marp CLI (for queue processor)
   */
  async convertSlidesToImages(slides: string[]): Promise<string[]> {
    this.logger.log('Converting slides to images using Marp CLI');
    
    try {
      // Use the video generation service's Marp CLI functionality
      const tempDir = path.join(process.cwd(), 'temp', 'slide-conversion');
      await fs.ensureDir(tempDir);
      
      // Generate slides using Marp CLI
      const slidesPath = await this.videoGenerationService['generateSlides'](slides, tempDir);
      
      // Get the generated image files
      const imageFiles = await fs.readdir(slidesPath);
      const imagePaths = imageFiles
        .filter(file => file.endsWith('.png'))
        .map(file => path.join(slidesPath, file))
        .sort(); // Sort to maintain slide order
      
      this.logger.log(`Generated ${imagePaths.length} slide images`);
      return imagePaths;
    } catch (error) {
      this.logger.error('Failed to convert slides to images:', error);
      throw new BadRequestException('Failed to convert slides to images');
    }
  }

  /**
   * Create video from slides and audio (for queue processor)
   */
  async createVideoFromSlides(slideImages: string[], audioBuffer: Buffer): Promise<string> {
    this.logger.log('Creating video from slides and audio');
    
    try {
      const videoResult = await this.videoGenerationService.generateVideo({
        title: 'Generated Video',
        slides: slideImages,
        transcript: 'Generated content',
        duration: 5 * slideImages.length, // 5 seconds per slide
      });
      
      return videoResult.videoUrl;
    } catch (error) {
      this.logger.error('Failed to create video from slides:', error);
      throw new BadRequestException('Failed to create video from slides');
    }
  }

  /**
   * Update lesson with video URL (for queue processor)
   */
  async updateLessonWithVideo(lessonId: string, videoUrl: string): Promise<void> {
    this.logger.log(`Updating lesson ${lessonId} with video URL`);
    
    try {
      // This would typically update the lesson entity in the database
      // For now, we'll log the action
      this.logger.log(`Lesson ${lessonId} updated with video: ${videoUrl}`);
    } catch (error) {
      this.logger.error(`Failed to update lesson ${lessonId}:`, error);
      throw new BadRequestException('Failed to update lesson with video');
    }
  }

  /**
   * Get course lessons (for queue processor)
   */
  async getCourseLessons(courseId: string): Promise<Array<{ id: string; content: string }>> {
    this.logger.log(`Getting lessons for course: ${courseId}`);
    
    try {
      const subtopics = await this.courseSubtopicRepository
        .createQueryBuilder('subtopic')
        .leftJoin('subtopic.topic', 'topic')
        .where('topic.course_id = :courseId', { courseId })
        .select(['subtopic.id', 'subtopic.content'])
        .getMany();

      return subtopics.map(subtopic => ({
        id: subtopic.id,
        content: subtopic.content,
      }));
    } catch (error) {
      this.logger.error(`Failed to get lessons for course ${courseId}:`, error);
      throw new BadRequestException('Failed to get course lessons');
    }
  }

  /**
   * Queue video generation job (for queue processor)
   */
  async queueVideoGeneration(data: {
    courseId: string;
    lessonId: string;
    content: string;
    userId: string;
  }): Promise<{ id: string }> {
    this.logger.log(`Queuing video generation for lesson: ${data.lessonId}`);
    
    try {
      const job = await this.queueService.queueVideoGeneration({
        courseId: data.courseId,
        lessonId: data.lessonId,
        content: data.content,
        userId: data.userId,
      });

      return { id: job.id.toString() };
    } catch (error) {
      this.logger.error('Failed to queue video generation:', error);
      throw new BadRequestException('Failed to queue video generation');
    }
  }

  /**
   * Save course roadmap (for queue processor)
   */
  async saveCourseRoadmap(courseId: string, roadmap: any): Promise<void> {
    this.logger.log(`Saving roadmap for course: ${courseId}`);
    
    try {
      // Save topics from roadmap
      for (const topicData of roadmap.topics) {
        const topic = this.courseTopicRepository.create({
          course_id: courseId,
          title: topicData.title,
          description: topicData.description,
          order_index: topicData.order,
          learning_objectives: topicData.learningObjectives || [],
        });

        await this.courseTopicRepository.save(topic);
      }

      this.logger.log(`Roadmap saved for course: ${courseId}`);
    } catch (error) {
      this.logger.error(`Failed to save roadmap for course ${courseId}:`, error);
      throw new BadRequestException('Failed to save course roadmap');
    }
  }

  /**
   * Generate course embeddings (for queue processor)
   */
  async generateCourseEmbeddings(courseId: string, content: string): Promise<void> {
    this.logger.log(`Generating embeddings for course: ${courseId}`);
    
    try {
      await this.ragService.generateEmbeddings(courseId, content);
      this.logger.log(`Embeddings generated for course: ${courseId}`);
    } catch (error) {
      this.logger.error(`Failed to generate embeddings for course ${courseId}:`, error);
      throw new BadRequestException('Failed to generate course embeddings');
    }
  }

  /**
   * Get course content (for queue processor)
   */
  async getCourseContent(courseId: string): Promise<string> {
    this.logger.log(`Getting content for course: ${courseId}`);
    
    try {
      const topics = await this.courseTopicRepository.find({
        where: { course_id: courseId },
        select: ['title', 'description'],
        order: { order_index: 'ASC' },
      });

      const subtopics = await this.courseSubtopicRepository
        .createQueryBuilder('subtopic')
        .leftJoin('subtopic.topic', 'topic')
        .where('topic.course_id = :courseId', { courseId })
        .select(['subtopic.title', 'subtopic.content'])
        .getMany();

      const content = [
        ...topics.map(topic => `${topic.title}: ${topic.description}`),
        ...subtopics.map(subtopic => `${subtopic.title}: ${subtopic.content}`),
      ].join('\n\n');

      return content;
    } catch (error) {
      this.logger.error(`Failed to get content for course ${courseId}:`, error);
      throw new BadRequestException('Failed to get course content');
    }
  }

  /**
   * Generate quiz (for queue processor)
   */
  async generateQuiz(topic: string, courseContent: string): Promise<any> {
    this.logger.log(`Generating quiz for topic: ${topic}`);
    
    try {
      const quiz = await this.generateQuizQuestions(topic, courseContent);
      return quiz;
    } catch (error) {
      this.logger.error(`Failed to generate quiz for topic ${topic}:`, error);
      throw new BadRequestException('Failed to generate quiz');
    }
  }

  /**
   * Save quiz (for queue processor)
   */
  async saveQuiz(courseId: string, quiz: any): Promise<void> {
    this.logger.log(`Saving quiz for course: ${courseId}`);
    
    try {
      // Find the first topic for this course to attach the quiz to
      const topic = await this.courseTopicRepository.findOne({
        where: { course_id: courseId },
        order: { order_index: 'ASC' },
      });

      if (topic) {
        const subtopic = this.courseSubtopicRepository.create({
          topic_id: topic.id,
          title: `Quiz: ${quiz.title || 'Course Quiz'}`,
          content: quiz.description || 'Course assessment quiz',
          type: 'quiz',
          order_index: 999, // Place at end
          quiz_data: quiz,
          is_required: true,
        });

        await this.courseSubtopicRepository.save(subtopic);
      }

      this.logger.log(`Quiz saved for course: ${courseId}`);
    } catch (error) {
      this.logger.error(`Failed to save quiz for course ${courseId}:`, error);
      throw new BadRequestException('Failed to save quiz');
    }
  }

  /**
   * Generate lesson content (for queue processor)
   */
  async generateLessonContent(topic: string): Promise<string> {
    this.logger.log(`Generating lesson content for topic: ${topic}`);
    
    try {
      const prompt = `Create comprehensive lesson content for the topic: ${topic}. Include:
1. Learning objectives
2. Key concepts
3. Examples and explanations
4. Summary

Make it educational and engaging.`;

      const content = await this.openaiService.generateText(prompt, {
        maxTokens: 1500,
        temperature: 0.7,
      });

      return content;
    } catch (error) {
      this.logger.error(`Failed to generate lesson content for topic ${topic}:`, error);
      throw new BadRequestException('Failed to generate lesson content');
    }
  }

  /**
   * Save lesson content (for queue processor)
   */
  async saveLessonContent(courseId: string, content: string): Promise<void> {
    this.logger.log(`Saving lesson content for course: ${courseId}`);
    
    try {
      // Find the first topic for this course to attach the content to
      const topic = await this.courseTopicRepository.findOne({
        where: { course_id: courseId },
        order: { order_index: 'ASC' },
      });

      if (topic) {
        const subtopic = this.courseSubtopicRepository.create({
          topic_id: topic.id,
          title: 'AI Generated Content',
          content: content,
          type: 'text',
          order_index: 1,
          is_required: true,
        });

        await this.courseSubtopicRepository.save(subtopic);
      }

      this.logger.log(`Lesson content saved for course: ${courseId}`);
    } catch (error) {
      this.logger.error(`Failed to save lesson content for course ${courseId}:`, error);
      throw new BadRequestException('Failed to save lesson content');
    }
  }

  /**
   * Generate content embeddings (for queue processor)
   */
  async generateContentEmbeddings(courseId: string, content: string): Promise<void> {
    this.logger.log(`Generating content embeddings for course: ${courseId}`);
    
    try {
      await this.ragService.generateEmbeddings(courseId, content);
      this.logger.log(`Content embeddings generated for course: ${courseId}`);
    } catch (error) {
      this.logger.error(`Failed to generate content embeddings for course ${courseId}:`, error);
      throw new BadRequestException('Failed to generate content embeddings');
    }
  }
}
