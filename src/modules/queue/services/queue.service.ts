import { Injectable, Logger, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

export interface VideoGenerationJobData {
  courseId: string;
  lessonId: string;
  content: string;
  userId: string;
}

export interface AIContentJobData {
  courseId: string;
  topic: string;
  userId: string;
  type: 'roadmap' | 'quiz' | 'content';
}

export interface TutorVerificationJobData {
  userId: string;
  action: 'payment_received' | 'documents_uploaded' | 'verification_complete';
}

interface JobStatus {
  id: string;
  name: string;
  data: any;
  progress: number;
  state: 'waiting' | 'active' | 'completed' | 'failed';
  returnvalue?: any;
  failedReason?: string;
  processedOn?: number;
  finishedOn?: number;
  createdAt: number;
}

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);
  private readonly jobCounter = new Map<string, number>();
  private readonly activeJobs = new Map<string, JobStatus>();

  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {
    // Initialize job counters
    this.jobCounter.set('video-generation', 0);
    this.jobCounter.set('ai-content-generation', 0);
    this.jobCounter.set('tutor-verification', 0);
  }

  /**
   * Queue video generation job
   */
  async queueVideoGeneration(data: VideoGenerationJobData): Promise<any> {
    this.logger.log(`Queuing video generation for course: ${data.courseId}, lesson: ${data.lessonId}`);
    
    const jobId = this.generateJobId('video-generation');
    const job: JobStatus = {
      id: jobId,
      name: 'generate-video',
      data,
      progress: 0,
      state: 'waiting',
      createdAt: Date.now(),
    };

    await this.cacheManager.set(`job:${jobId}`, job, 3600000); // 1 hour TTL
    this.activeJobs.set(jobId, job);

    // Process job immediately (simulate async processing)
    setImmediate(() => this.processVideoGenerationJob(jobId, data));

    return { id: jobId };
  }

  /**
   * Queue course video generation (all lessons)
   */
  async queueCourseVideoGeneration(courseId: string, userId: string): Promise<any> {
    this.logger.log(`Queuing course video generation for course: ${courseId}`);
    
    const jobId = this.generateJobId('video-generation');
    const job: JobStatus = {
      id: jobId,
      name: 'generate-course-videos',
      data: { courseId, userId },
      progress: 0,
      state: 'waiting',
      createdAt: Date.now(),
    };

    await this.cacheManager.set(`job:${jobId}`, job, 3600000);
    this.activeJobs.set(jobId, job);

    setImmediate(() => this.processCourseVideoGenerationJob(jobId, courseId, userId));

    return { id: jobId };
  }

  /**
   * Queue AI content generation
   */
  async queueAIContentGeneration(data: AIContentJobData): Promise<any> {
    this.logger.log(`Queuing AI content generation for course: ${data.courseId}, type: ${data.type}`);
    
    const jobId = this.generateJobId('ai-content-generation');
    const job: JobStatus = {
      id: jobId,
      name: `generate-${data.type}`,
      data,
      progress: 0,
      state: 'waiting',
      createdAt: Date.now(),
    };

    await this.cacheManager.set(`job:${jobId}`, job, 3600000);
    this.activeJobs.set(jobId, job);

    setImmediate(() => this.processAIContentJob(jobId, data));

    return { id: jobId };
  }

  /**
   * Queue tutor verification job
   */
  async queueTutorVerification(data: TutorVerificationJobData): Promise<any> {
    this.logger.log(`Queuing tutor verification for user: ${data.userId}, action: ${data.action}`);
    
    const jobId = this.generateJobId('tutor-verification');
    const job: JobStatus = {
      id: jobId,
      name: `handle-${data.action.replace('_', '-')}`,
      data,
      progress: 0,
      state: 'waiting',
      createdAt: Date.now(),
    };

    await this.cacheManager.set(`job:${jobId}`, job, 3600000);
    this.activeJobs.set(jobId, job);

    setImmediate(() => this.processTutorVerificationJob(jobId, data));

    return { id: jobId };
  }

  /**
   * Get job status
   */
  async getJobStatus(queueName: string, jobId: string): Promise<any> {
    const job = await this.cacheManager.get<JobStatus>(`job:${jobId}`);
    
    if (!job) {
      return null;
    }

    return job;
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(): Promise<any> {
    const stats = {
      'video-generation': { waiting: 0, active: 0, completed: 0, failed: 0 },
      'ai-content-generation': { waiting: 0, active: 0, completed: 0, failed: 0 },
      'tutor-verification': { waiting: 0, active: 0, completed: 0, failed: 0 },
    };

    for (const [jobId, job] of this.activeJobs) {
      const queueName = this.getQueueNameFromJobId(jobId);
      if (queueName && queueName in stats) {
        (stats as any)[queueName][job.state]++;
      }
    }

    return stats;
  }

  /**
   * Clean completed jobs
   */
  async cleanCompletedJobs(queueName: string, grace: number = 5000): Promise<void> {
    const now = Date.now();
    const jobsToRemove: string[] = [];

    for (const [jobId, job] of this.activeJobs) {
      const jobQueueName = this.getQueueNameFromJobId(jobId);
      if (jobQueueName === queueName && 
          (job.state === 'completed' || job.state === 'failed') &&
          (now - (job.finishedOn || job.createdAt)) > grace) {
        jobsToRemove.push(jobId);
      }
    }

    for (const jobId of jobsToRemove) {
      await this.cacheManager.del(`job:${jobId}`);
      this.activeJobs.delete(jobId);
    }

    this.logger.log(`Cleaned ${jobsToRemove.length} completed jobs for queue: ${queueName}`);
  }

  // Helper methods
  private generateJobId(queueName: string): string {
    const counter = this.jobCounter.get(queueName) || 0;
    this.jobCounter.set(queueName, counter + 1);
    return `${queueName}-${Date.now()}-${counter}`;
  }

  private getQueueNameFromJobId(jobId: string): string | null {
    if (jobId.startsWith('video-generation-')) return 'video-generation';
    if (jobId.startsWith('ai-content-generation-')) return 'ai-content-generation';
    if (jobId.startsWith('tutor-verification-')) return 'tutor-verification';
    return null;
  }

  private async updateJobStatus(jobId: string, updates: Partial<JobStatus>): Promise<void> {
    const job = this.activeJobs.get(jobId);
    if (job) {
      Object.assign(job, updates);
      await this.cacheManager.set(`job:${jobId}`, job, 3600000);
    }
  }

  // Job processing methods (simplified implementations)
  private async processVideoGenerationJob(jobId: string, data: VideoGenerationJobData): Promise<void> {
    try {
      await this.updateJobStatus(jobId, { state: 'active', processedOn: Date.now() });
      // Simulate video generation processing
      await this.updateJobStatus(jobId, { progress: 50 });
      // In a real implementation, this would call the actual video generation service
      await this.updateJobStatus(jobId, { 
        state: 'completed', 
        progress: 100, 
        finishedOn: Date.now(),
        returnvalue: { success: true, videoUrl: 'generated-video-url' }
      });
    } catch (error) {
      await this.updateJobStatus(jobId, { 
        state: 'failed', 
        finishedOn: Date.now(),
        failedReason: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async processCourseVideoGenerationJob(jobId: string, courseId: string, userId: string): Promise<void> {
    try {
      await this.updateJobStatus(jobId, { state: 'active', processedOn: Date.now() });
      // Simulate course video generation processing
      await this.updateJobStatus(jobId, { progress: 50 });
      await this.updateJobStatus(jobId, { 
        state: 'completed', 
        progress: 100, 
        finishedOn: Date.now(),
        returnvalue: { success: true, videosGenerated: 10 }
      });
    } catch (error) {
      await this.updateJobStatus(jobId, { 
        state: 'failed', 
        finishedOn: Date.now(),
        failedReason: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async processAIContentJob(jobId: string, data: AIContentJobData): Promise<void> {
    try {
      await this.updateJobStatus(jobId, { state: 'active', processedOn: Date.now() });
      // Simulate AI content generation processing
      await this.updateJobStatus(jobId, { progress: 50 });
      await this.updateJobStatus(jobId, { 
        state: 'completed', 
        progress: 100, 
        finishedOn: Date.now(),
        returnvalue: { success: true, contentGenerated: true }
      });
    } catch (error) {
      await this.updateJobStatus(jobId, { 
        state: 'failed', 
        finishedOn: Date.now(),
        failedReason: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async processTutorVerificationJob(jobId: string, data: TutorVerificationJobData): Promise<void> {
    try {
      await this.updateJobStatus(jobId, { state: 'active', processedOn: Date.now() });
      // Simulate tutor verification processing
      await this.updateJobStatus(jobId, { progress: 50 });
      await this.updateJobStatus(jobId, { 
        state: 'completed', 
        progress: 100, 
        finishedOn: Date.now(),
        returnvalue: { success: true, verificationComplete: true }
      });
    } catch (error) {
      await this.updateJobStatus(jobId, { 
        state: 'failed', 
        finishedOn: Date.now(),
        failedReason: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}
