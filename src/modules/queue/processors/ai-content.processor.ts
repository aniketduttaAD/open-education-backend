import { Injectable, Logger } from '@nestjs/common';
import { AIService } from '../../ai/services/ai.service';

export interface AIContentGenerationJobData {
  courseId: string;
  topic: string;
  userId: string;
  type: 'roadmap' | 'quiz' | 'content';
}

@Injectable()
export class AIContentProcessor {
  private readonly logger = new Logger(AIContentProcessor.name);

  constructor(private readonly aiService: AIService) {}

  async handleRoadmapGeneration(data: AIContentGenerationJobData) {
    const { courseId, topic, userId } = data;
    
    this.logger.log(`Generating roadmap for course: ${courseId}, topic: ${topic}`);
    
    try {
      // Generate course roadmap
      const roadmap = await this.aiService.generateCourseRoadmap(
        topic,
        `Course content for ${topic}`,
        'beginner'
      );
      
      // Save roadmap to database
      await this.aiService.saveCourseRoadmap(courseId, roadmap);
      
      // Generate embeddings for search
      await this.aiService.generateCourseEmbeddings(courseId, JSON.stringify(roadmap));
      
      this.logger.log(`Roadmap generation completed for course: ${courseId}`);
      
      return {
        success: true,
        courseId,
        roadmap,
      };
      
    } catch (error) {
      this.logger.error(`Roadmap generation failed for course: ${courseId}`, error);
      throw error;
    }
  }

  async handleQuizGeneration(data: AIContentGenerationJobData) {
    const { courseId, topic, userId } = data;
    
    this.logger.log(`Generating quiz for course: ${courseId}, topic: ${topic}`);
    
    try {
      // Get course content for context
      const courseContent = await this.aiService.getCourseContent(courseId);
      
      // Generate quiz questions
      const quiz = await this.aiService.generateQuiz(topic, courseContent);
      
      // Save quiz to database
      await this.aiService.saveQuiz(courseId, quiz);
      
      this.logger.log(`Quiz generation completed for course: ${courseId}`);
      
      return {
        success: true,
        courseId,
        quiz,
      };
      
    } catch (error) {
      this.logger.error(`Quiz generation failed for course: ${courseId}`, error);
      throw error;
    }
  }

  async handleContentGeneration(data: AIContentGenerationJobData) {
    const { courseId, topic, userId } = data;
    
    this.logger.log(`Generating content for course: ${courseId}, topic: ${topic}`);
    
    try {
      // Generate lesson content
      const content = await this.aiService.generateLessonContent(topic);
      
      // Save content to database
      await this.aiService.saveLessonContent(courseId, content);
      
      // Generate embeddings
      await this.aiService.generateContentEmbeddings(courseId, content);
      
      this.logger.log(`Content generation completed for course: ${courseId}`);
      
      return {
        success: true,
        courseId,
        content,
      };
      
    } catch (error) {
      this.logger.error(`Content generation failed for course: ${courseId}`, error);
      throw error;
    }
  }
}
