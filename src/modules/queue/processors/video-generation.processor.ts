import { Injectable, Logger } from '@nestjs/common';
import { AIService } from '../../ai/services/ai.service';

export interface VideoGenerationJobData {
  courseId: string;
  lessonId: string;
  content: string;
  userId: string;
}

@Injectable()
export class VideoGenerationProcessor {
  private readonly logger = new Logger(VideoGenerationProcessor.name);

  constructor(private readonly aiService: AIService) {}

  async handleVideoGeneration(data: VideoGenerationJobData) {
    const { courseId, lessonId, content, userId } = data;
    
    this.logger.log(`Starting video generation for course: ${courseId}, lesson: ${lessonId}`);
    
    try {
      // Generate slides using AI
      this.logger.log('Generating slides with AI...');
      const slides = await this.aiService.generateSlides(content);
      
      // Convert slides to images using Marp
      this.logger.log('Converting slides to images...');
      const slideImages = await this.aiService.convertSlidesToImages(slides);
      
      // Generate TTS audio
      this.logger.log('Generating TTS audio...');
      const audioBuffer = await this.aiService.generateTTS(content);
      
      // Combine slides and audio into video
      this.logger.log('Creating video with FFmpeg...');
      const videoUrl = await this.aiService.createVideoFromSlides(slideImages, audioBuffer);
      
      // Update lesson with video URL
      await this.aiService.updateLessonWithVideo(lessonId, videoUrl);
      
      this.logger.log(`Video generation completed for lesson: ${lessonId}`);
      
      return {
        success: true,
        videoUrl,
        lessonId,
        courseId,
      };
      
    } catch (error) {
      this.logger.error(`Video generation failed for lesson: ${lessonId}`, error);
      throw error;
    }
  }

  async handleCourseVideoGeneration(data: { courseId: string; userId: string }) {
    const { courseId, userId } = data;
    
    this.logger.log(`Starting course video generation for course: ${courseId}`);
    
    try {
      // Get course lessons
      const lessons = await this.aiService.getCourseLessons(courseId);
      
      const results = [];
      let completed = 0;
      
      for (const lesson of lessons) {
        try {
          // Create individual video generation job
          const videoJob = await this.aiService.queueVideoGeneration({
            courseId,
            lessonId: lesson.id,
            content: lesson.content,
            userId,
          });
          
          results.push({
            lessonId: lesson.id,
            jobId: videoJob.id,
            status: 'queued',
          });
          
          completed++;
          
        } catch (error) {
          this.logger.error(`Failed to queue video for lesson: ${lesson.id}`, error);
          results.push({
            lessonId: lesson.id,
            status: 'failed',
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
      
      this.logger.log(`Course video generation queued for ${results.length} lessons`);
      
      return {
        success: true,
        courseId,
        totalLessons: lessons.length,
        results,
      };
      
    } catch (error) {
      this.logger.error(`Course video generation failed for course: ${courseId}`, error);
      throw error;
    }
  }
}
