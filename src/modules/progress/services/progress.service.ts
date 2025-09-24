import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VideoProgress } from '../entities';
import { StartVideoProgressDto, UpdateVideoProgressDto, CompleteVideoProgressDto } from '../dto';

@Injectable()
export class ProgressService {
  constructor(
    @InjectRepository(VideoProgress)
    private videoProgressRepository: Repository<VideoProgress>,
  ) {}

  async startVideoProgress(startDto: StartVideoProgressDto, studentId: string): Promise<VideoProgress> {
    // Check if progress already exists
    let progress = await this.videoProgressRepository.findOne({
      where: {
        student_id: studentId,
        subtopic_id: startDto.subtopic_id,
        enrollment_id: startDto.enrollment_id,
      },
    });

    if (progress) {
      // Update existing progress
      progress.status = 'started';
      progress.started_at = new Date();
      progress.last_watched_at = new Date();
      if (startDto.total_duration_seconds) {
        progress.total_duration_seconds = startDto.total_duration_seconds;
      }
    } else {
      // Create new progress
      progress = this.videoProgressRepository.create({
        student_id: studentId,
        subtopic_id: startDto.subtopic_id,
        enrollment_id: startDto.enrollment_id,
        status: 'started',
        started_at: new Date(),
        last_watched_at: new Date(),
        total_duration_seconds: startDto.total_duration_seconds || 0,
        max_skip_attempts: 3, // Default max skip attempts
      });
    }

    return this.videoProgressRepository.save(progress);
  }

  async updateVideoProgress(
    progressId: string, 
    updateDto: UpdateVideoProgressDto, 
    studentId: string
  ): Promise<VideoProgress> {
    const progress = await this.videoProgressRepository.findOne({
      where: {
        id: progressId,
        student_id: studentId,
      },
    });

    if (!progress) {
      throw new NotFoundException('Video progress not found');
    }

    if (progress.status === 'completed') {
      throw new BadRequestException('Cannot update completed video progress');
    }

    // Update progress data
    progress.current_time_seconds = updateDto.current_time_seconds;
    progress.last_watched_at = new Date();
    
    if (updateDto.playback_speed) {
      progress.playback_speed = updateDto.playback_speed;
    }

    // Calculate progress percentage
    if (progress.total_duration_seconds > 0) {
      progress.progress_percentage = Math.min(
        (progress.current_time_seconds / progress.total_duration_seconds) * 100,
        100
      );
    }

    // Update status based on progress
    if (progress.progress_percentage >= 90) {
      progress.status = 'in_progress';
    } else if (progress.progress_percentage > 0) {
      progress.status = 'in_progress';
    }

    // Add to watch history
    if (!progress.watch_history) {
      progress.watch_history = [];
    }

    progress.watch_history.push({
      timestamp: new Date().toISOString(),
      current_time: updateDto.current_time_seconds,
      duration: progress.total_duration_seconds,
      action: updateDto.action || 'play',
    });

    // Keep only last 100 history entries
    if (progress.watch_history.length > 100) {
      progress.watch_history = progress.watch_history.slice(-100);
    }

    return this.videoProgressRepository.save(progress);
  }

  async completeVideoProgress(
    progressId: string, 
    completeDto: CompleteVideoProgressDto, 
    studentId: string
  ): Promise<VideoProgress> {
    const progress = await this.videoProgressRepository.findOne({
      where: {
        id: progressId,
        student_id: studentId,
      },
    });

    if (!progress) {
      throw new NotFoundException('Video progress not found');
    }

    // Validate completion (must watch at least 90% of video)
    const completionThreshold = 0.9;
    const actualProgress = progress.total_duration_seconds > 0 
      ? completeDto.current_time_seconds / progress.total_duration_seconds 
      : 0;

    if (actualProgress < completionThreshold) {
      throw new BadRequestException('Must watch at least 90% of the video to mark as complete');
    }

    // Update progress
    progress.status = 'completed';
    progress.current_time_seconds = completeDto.current_time_seconds;
    progress.progress_percentage = 100;
    progress.completed_at = new Date();
    progress.last_watched_at = new Date();
    progress.total_watch_time_seconds = completeDto.total_watch_time_seconds || completeDto.current_time_seconds;

    // Calculate integrity score
    progress.integrity_checks = this.calculateIntegrityScore(progress);

    // Add completion to watch history
    if (!progress.watch_history) {
      progress.watch_history = [];
    }

    progress.watch_history.push({
      timestamp: new Date().toISOString(),
      current_time: completeDto.current_time_seconds,
      duration: progress.total_duration_seconds,
      action: 'complete',
    });

    return this.videoProgressRepository.save(progress);
  }

  async getVideoProgress(progressId: string, studentId: string): Promise<VideoProgress> {
    const progress = await this.videoProgressRepository.findOne({
      where: {
        id: progressId,
        student_id: studentId,
      },
      relations: ['subtopic', 'enrollment'],
    });

    if (!progress) {
      throw new NotFoundException('Video progress not found');
    }

    return progress;
  }

  async getCourseProgress(courseId: string, studentId: string): Promise<any> {
    const progressData = await this.videoProgressRepository
      .createQueryBuilder('vp')
      .leftJoin('vp.subtopic', 'subtopic')
      .leftJoin('subtopic.topic', 'topic')
      .leftJoin('vp.enrollment', 'enrollment')
      .where('enrollment.course_id = :courseId', { courseId })
      .andWhere('vp.student_id = :studentId', { studentId })
      .select([
        'vp.id',
        'vp.subtopic_id',
        'vp.status',
        'vp.progress_percentage',
        'vp.completed_at',
        'subtopic.title',
        'subtopic.duration_minutes',
        'topic.title',
        'topic.order_index',
      ])
      .orderBy('topic.order_index', 'ASC')
      .addOrderBy('subtopic.order_index', 'ASC')
      .getMany();

    // Calculate overall course progress
    const totalSubtopics = progressData.length;
    const completedSubtopics = progressData.filter(p => p.status === 'completed').length;
    const overallProgress = totalSubtopics > 0 ? (completedSubtopics / totalSubtopics) * 100 : 0;

    // Group by topics
    const topicsProgress = progressData.reduce((acc, progress) => {
      const topicTitle = (progress as any).topic?.title || 'Unknown Topic';
      if (!acc[topicTitle]) {
        acc[topicTitle] = {
          topic_title: topicTitle,
          subtopics: [],
          completed_subtopics: 0,
          total_subtopics: 0,
          progress_percentage: 0,
        };
      }

      acc[topicTitle].subtopics.push({
        subtopic_id: progress.subtopic_id,
        title: (progress as any).subtopic?.title,
        status: progress.status,
        progress_percentage: progress.progress_percentage,
        completed_at: progress.completed_at,
      });

      acc[topicTitle].total_subtopics += 1;
      if (progress.status === 'completed') {
        acc[topicTitle].completed_subtopics += 1;
      }

      acc[topicTitle].progress_percentage = 
        (acc[topicTitle].completed_subtopics / acc[topicTitle].total_subtopics) * 100;

      return acc;
    }, {} as any);

    return {
      course_id: courseId,
      student_id: studentId,
      overall_progress: Math.round(overallProgress * 100) / 100,
      completed_subtopics: completedSubtopics,
      total_subtopics: totalSubtopics,
      topics_progress: Object.values(topicsProgress),
      last_updated: new Date().toISOString(),
    };
  }

  async getStudentProgress(studentId: string, page: number = 1, limit: number = 10): Promise<{ progress: VideoProgress[]; total: number }> {
    const [progress, total] = await this.videoProgressRepository
      .createQueryBuilder('vp')
      .leftJoinAndSelect('vp.subtopic', 'subtopic')
      .leftJoinAndSelect('subtopic.topic', 'topic')
      .leftJoinAndSelect('vp.enrollment', 'enrollment')
      .where('vp.student_id = :studentId', { studentId })
      .orderBy('vp.last_watched_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { progress, total };
  }

  async getProgressAnalytics(courseId: string): Promise<any> {
    const analytics = await this.videoProgressRepository
      .createQueryBuilder('vp')
      .leftJoin('vp.enrollment', 'enrollment')
      .leftJoin('vp.subtopic', 'subtopic')
      .where('enrollment.course_id = :courseId', { courseId })
      .select([
        'vp.status',
        'AVG(vp.progress_percentage) as avg_progress',
        'COUNT(vp.id) as total_progress',
        'AVG(vp.total_watch_time_seconds) as avg_watch_time',
        'AVG(vp.playback_speed) as avg_playback_speed',
      ])
      .groupBy('vp.status')
      .getRawMany();

    const totalStudents = await this.videoProgressRepository
      .createQueryBuilder('vp')
      .leftJoin('vp.enrollment', 'enrollment')
      .where('enrollment.course_id = :courseId', { courseId })
      .select('COUNT(DISTINCT vp.student_id)', 'total_students')
      .getRawOne();

    return {
      course_id: courseId,
      total_students: parseInt(totalStudents.total_students) || 0,
      progress_distribution: analytics,
      generated_at: new Date().toISOString(),
    };
  }

  private calculateIntegrityScore(progress: VideoProgress): any {
    const totalPlayTime = progress.total_watch_time_seconds;
    const expectedPlayTime = progress.total_duration_seconds;
    const skipPenalty = progress.skip_attempts * 0.1; // 10% penalty per skip
    
    let integrityScore = 1.0;
    
    if (expectedPlayTime > 0) {
      const playTimeRatio = totalPlayTime / expectedPlayTime;
      integrityScore = Math.max(0, playTimeRatio - skipPenalty);
    }

    return {
      total_play_time: totalPlayTime,
      expected_play_time: expectedPlayTime,
      skip_penalty: skipPenalty,
      integrity_score: Math.round(integrityScore * 100) / 100,
    };
  }
}
