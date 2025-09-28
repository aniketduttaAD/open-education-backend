import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fs from 'fs-extra';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import OpenAI from 'openai';
import { ConfigService } from '@nestjs/config';
import { WebSocketGateway } from '../../websocket/websocket.gateway';
import { MinioService } from '../../storage/services/minio.service';
import { EmbeddingsService } from '../../ai/services/embeddings.service';
import { AIBuddyService } from '../../ai/services/ai-buddy.service';
import { AssessmentGenerationService } from '../../ai/services/assessment-generation.service';
import { CourseGenerationProgress, CourseSection, CourseSubtopic } from '../../courses/entities';
import { ProgressUpdate } from '../../websocket/interfaces/progress-update.interface';
import { MINIO_BUCKETS } from '../../../config/minio.config';

const execAsync = promisify(exec);

interface ProgressData {
  progressId: string;
  courseId: string;
  sessionId: string;
  totalSections: number;
  totalSubtopics: number;
  currentSectionIndex: number;
  currentSubtopicIndex: number;
}

@Injectable()
@Processor('content-generation')
export class EnhancedContentGenerationProcessor extends WorkerHost {
  private readonly logger = new Logger(EnhancedContentGenerationProcessor.name);
  private readonly openai: OpenAI;

  constructor(
    private readonly configService: ConfigService,
    private readonly websocketGateway: WebSocketGateway,
    private readonly minioService: MinioService,
    private readonly embeddingsService: EmbeddingsService,
    private readonly aiBuddyService: AIBuddyService,
    private readonly assessmentService: AssessmentGenerationService,
    @InjectRepository(CourseGenerationProgress)
    private readonly progressRepository: Repository<CourseGenerationProgress>,
    @InjectRepository(CourseSection)
    private readonly sectionRepository: Repository<CourseSection>,
    @InjectRepository(CourseSubtopic)
    private readonly subtopicRepository: Repository<CourseSubtopic>,
  ) {
    super();
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
    });
  }

  async process(job: Job<any, any, string>): Promise<any> {
    const { courseId, roadmapId, progressId, roadmapData, sessionId } = job.data;
    this.logger.log(`Starting course content generation for course: ${courseId}`);

    const baseDir = path.join(process.cwd(), 'temp', 'course-generation', courseId);
    await fs.ensureDir(baseDir);

    try {
      // Initialize progress tracking
      await this.updateProgress(progressId, {
        status: 'processing',
        current_step: 'initializing',
        progress_percentage: 0,
      });

      this.emitProgress(courseId, sessionId, {
        progressPercentage: 0,
        currentTask: 'Starting content generation pipeline...',
        estimatedTimeRemaining: await this.calculateEstimatedTime(roadmapData),
      });

      // Get course sections and subtopics from database
      const sections = await this.sectionRepository.find({
        where: { course_id: courseId },
        relations: ['subtopics'],
        order: { index: 'ASC' },
      });

      let globalProgress = 0;
      const totalSteps = this.getTotalSteps(sections);

      // Step 1: Generate MD files for all subtopics (5-25%)
      globalProgress = await this.generateMarkdownFiles(
        sections,
        baseDir,
        progressId,
        courseId,
        sessionId,
        roadmapData,
        5,
        20
      );

      // Step 2: Generate transcripts (25-45%)
      globalProgress = await this.generateTranscripts(
        sections,
        baseDir,
        progressId,
        courseId,
        sessionId,
        25,
        20
      );

      // Step 3: Generate audio files with TTS (45-65%)
      globalProgress = await this.generateAudioFiles(
        sections,
        baseDir,
        progressId,
        courseId,
        sessionId,
        45,
        20
      );

      // Step 4: Generate images from MD using Marp (65-75%)
      globalProgress = await this.generateImages(
        sections,
        baseDir,
        progressId,
        courseId,
        sessionId,
        65,
        10
      );

      // Step 5: Compile videos with FFmpeg (75-85%)
      globalProgress = await this.compileVideos(
        sections,
        baseDir,
        progressId,
        courseId,
        sessionId,
        75,
        10
      );

      // Step 6: Upload to MinIO and update database (85-95%)
      globalProgress = await this.uploadAndUpdateDatabase(
        sections,
        baseDir,
        progressId,
        courseId,
        sessionId,
        85,
        10
      );

      // Step 7: Generate embeddings, quizzes, and flashcards (95-100%)
      await this.generatePostProcessingContent(
        sections,
        baseDir,
        progressId,
        courseId,
        sessionId,
        roadmapData,
        95,
        5
      );

      // Final cleanup
      await this.cleanupLocalFiles(baseDir);

      await this.updateProgress(progressId, {
        status: 'completed',
        current_step: 'completed',
        progress_percentage: 100,
        completed_at: new Date(),
      });

      this.emitProgress(courseId, sessionId, {
        progressPercentage: 100,
        currentTask: 'Course generation completed successfully!',
        estimatedTimeRemaining: 0,
      });

      return { success: true, courseId, totalSections: sections.length };

    } catch (error) {
      this.logger.error(`Content generation failed for course ${courseId}:`, error);

      await this.updateProgress(progressId, {
        status: 'failed',
        error_log: [{
          timestamp: new Date().toISOString(),
          error: error.message,
          step: 'content_generation'
        }],
      });

      this.emitProgress(courseId, sessionId, {
        progressPercentage: -1,
        currentTask: 'Content generation failed',
        estimatedTimeRemaining: 0,
        errors: [{ step: 'content_generation', error: error.message, timestamp: new Date().toISOString() }],
      });

      // Cleanup on failure
      await this.cleanupLocalFiles(baseDir);
      throw error;
    }
  }

  private async generateMarkdownFiles(
    sections: any[],
    baseDir: string,
    progressId: string,
    courseId: string,
    sessionId: string,
    roadmapData: any,
    startProgress: number,
    progressRange: number
  ): Promise<number> {
    this.logger.log('Starting markdown file generation...');

    let currentProgress = startProgress;
    const sectionCount = sections.length;

    for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex++) {
      const section = sections[sectionIndex];
      const subtopics = section.subtopics || [];

      for (let subtopicIndex = 0; subtopicIndex < subtopics.length; subtopicIndex++) {
        const subtopic = subtopics[subtopicIndex];

        // Calculate context summaries
        const { prevSummary, nextSummary } = this.getSubtopicContext(
          sections, sectionIndex, subtopicIndex
        );

        // Generate markdown content
        const markdownContent = await this.generateSubtopicMarkdown({
          sectionTitle: section.title,
          subtopicTitle: subtopic.title,
          roadmapJson: JSON.stringify(roadmapData),
          prevSummary,
          nextSummary
        });

        // Save markdown file
        const mdDir = path.join(baseDir, 'markdown', section.title);
        await fs.ensureDir(mdDir);
        const mdFile = path.join(mdDir, `${subtopic.title.replace(/[^a-zA-Z0-9]/g, '_')}.md`);
        await fs.writeFile(mdFile, markdownContent);

        // Update subtopic with markdown path
        await this.subtopicRepository.update(subtopic.id, {
          markdown_path: mdFile,
          status: 'markdown_generated'
        });

        // Update progress
        const stepProgress = ((sectionIndex * subtopics.length + subtopicIndex + 1) / this.getTotalSubtopics(sections)) * progressRange;
        currentProgress = startProgress + stepProgress;

        await this.updateProgress(progressId, {
          current_step: `generating_markdown_${section.title}_${subtopic.title}`,
          progress_percentage: Math.floor(currentProgress),
          current_section_index: sectionIndex,
          current_subtopic_index: subtopicIndex,
        });

        this.emitProgress(courseId, sessionId, {
          progressPercentage: Math.floor(currentProgress),
          currentTask: `Generating content for: ${section.title} - ${subtopic.title}`,
          currentSection: section.title,
          currentSubtopic: subtopic.title,
          estimatedTimeRemaining: this.calculateRemainingTime(currentProgress),
        });

        // Add small delay to prevent rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return currentProgress;
  }

  private async generateTranscripts(
    sections: any[],
    baseDir: string,
    progressId: string,
    courseId: string,
    sessionId: string,
    startProgress: number,
    progressRange: number
  ): Promise<number> {
    this.logger.log('Starting transcript generation...');

    let currentProgress = startProgress;

    for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex++) {
      const section = sections[sectionIndex];
      const subtopics = section.subtopics || [];

      for (let subtopicIndex = 0; subtopicIndex < subtopics.length; subtopicIndex++) {
        const subtopic = subtopics[subtopicIndex];

        // Read the generated markdown
        const mdFile = subtopic.markdown_path;
        const markdownContent = await fs.readFile(mdFile, 'utf8');

        // Generate transcript with timestamps
        const transcript = await this.generateTimestampedTranscript(
          subtopic.title,
          section.title,
          markdownContent
        );

        // Save transcript file
        const transcriptDir = path.join(baseDir, 'transcripts', section.title);
        await fs.ensureDir(transcriptDir);
        const transcriptFile = path.join(transcriptDir, `${subtopic.title.replace(/[^a-zA-Z0-9]/g, '_')}.txt`);
        await fs.writeFile(transcriptFile, transcript);

        // Update subtopic with transcript path
        await this.subtopicRepository.update(subtopic.id, {
          transcript_path: transcriptFile,
          status: 'transcript_generated'
        });

        // Update progress
        const stepProgress = ((sectionIndex * subtopics.length + subtopicIndex + 1) / this.getTotalSubtopics(sections)) * progressRange;
        currentProgress = startProgress + stepProgress;

        await this.updateProgress(progressId, {
          current_step: `generating_transcript_${section.title}_${subtopic.title}`,
          progress_percentage: Math.floor(currentProgress),
        });

        this.emitProgress(courseId, sessionId, {
          progressPercentage: Math.floor(currentProgress),
          currentTask: `Creating transcript for: ${section.title} - ${subtopic.title}`,
          currentSection: section.title,
          currentSubtopic: subtopic.title,
          estimatedTimeRemaining: this.calculateRemainingTime(currentProgress),
        });

        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return currentProgress;
  }

  private async generateAudioFiles(
    sections: any[],
    baseDir: string,
    progressId: string,
    courseId: string,
    sessionId: string,
    startProgress: number,
    progressRange: number
  ): Promise<number> {
    this.logger.log('Starting audio generation with subtitle timing...');

    let currentProgress = startProgress;

    for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex++) {
      const section = sections[sectionIndex];
      const subtopics = section.subtopics || [];

      for (let subtopicIndex = 0; subtopicIndex < subtopics.length; subtopicIndex++) {
        const subtopic = subtopics[subtopicIndex];

        // Read transcript
        const transcriptContent = await fs.readFile(subtopic.transcript_path, 'utf8');

        // Generate audio with subtitle timing
        const audioFile = await this.generateSubtitleNarratedAudio(
          transcriptContent,
          baseDir,
          section.title,
          subtopic.title
        );

        // Update subtopic with audio path
        await this.subtopicRepository.update(subtopic.id, {
          audio_path: audioFile,
          status: 'audio_generated'
        });

        // Update progress
        const stepProgress = ((sectionIndex * subtopics.length + subtopicIndex + 1) / this.getTotalSubtopics(sections)) * progressRange;
        currentProgress = startProgress + stepProgress;

        await this.updateProgress(progressId, {
          current_step: `generating_audio_${section.title}_${subtopic.title}`,
          progress_percentage: Math.floor(currentProgress),
        });

        this.emitProgress(courseId, sessionId, {
          progressPercentage: Math.floor(currentProgress),
          currentTask: `Generating audio for: ${section.title} - ${subtopic.title}`,
          currentSection: section.title,
          currentSubtopic: subtopic.title,
          estimatedTimeRemaining: this.calculateRemainingTime(currentProgress),
        });

        await new Promise(resolve => setTimeout(resolve, 2000)); // Longer delay for TTS
      }
    }

    return currentProgress;
  }

  private async generateImages(
    sections: any[],
    baseDir: string,
    progressId: string,
    courseId: string,
    sessionId: string,
    startProgress: number,
    progressRange: number
  ): Promise<number> {
    this.logger.log('Starting image generation using Marp CLI...');

    let currentProgress = startProgress;

    for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex++) {
      const section = sections[sectionIndex];
      const subtopics = section.subtopics || [];

      for (let subtopicIndex = 0; subtopicIndex < subtopics.length; subtopicIndex++) {
        const subtopic = subtopics[subtopicIndex];

        // Convert markdown to images using Marp CLI
        const imagesDir = await this.convertMarkdownToImages(
          subtopic.markdown_path,
          baseDir,
          section.title,
          subtopic.title
        );

        // Update progress
        const stepProgress = ((sectionIndex * subtopics.length + subtopicIndex + 1) / this.getTotalSubtopics(sections)) * progressRange;
        currentProgress = startProgress + stepProgress;

        await this.updateProgress(progressId, {
          current_step: `generating_images_${section.title}_${subtopic.title}`,
          progress_percentage: Math.floor(currentProgress),
        });

        this.emitProgress(courseId, sessionId, {
          progressPercentage: Math.floor(currentProgress),
          currentTask: `Creating slides for: ${section.title} - ${subtopic.title}`,
          currentSection: section.title,
          currentSubtopic: subtopic.title,
          estimatedTimeRemaining: this.calculateRemainingTime(currentProgress),
        });
      }
    }

    return currentProgress;
  }

  private async compileVideos(
    sections: any[],
    baseDir: string,
    progressId: string,
    courseId: string,
    sessionId: string,
    startProgress: number,
    progressRange: number
  ): Promise<number> {
    this.logger.log('Starting video compilation with FFmpeg...');

    let currentProgress = startProgress;

    for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex++) {
      const section = sections[sectionIndex];
      const subtopics = section.subtopics || [];

      for (let subtopicIndex = 0; subtopicIndex < subtopics.length; subtopicIndex++) {
        const subtopic = subtopics[subtopicIndex];

        // Compile video using FFmpeg
        const videoFile = await this.compileVideoWithFFmpeg(
          subtopic.audio_path,
          baseDir,
          section.title,
          subtopic.title
        );

        // Update progress
        const stepProgress = ((sectionIndex * subtopics.length + subtopicIndex + 1) / this.getTotalSubtopics(sections)) * progressRange;
        currentProgress = startProgress + stepProgress;

        await this.updateProgress(progressId, {
          current_step: `compiling_video_${section.title}_${subtopic.title}`,
          progress_percentage: Math.floor(currentProgress),
        });

        this.emitProgress(courseId, sessionId, {
          progressPercentage: Math.floor(currentProgress),
          currentTask: `Compiling video for: ${section.title} - ${subtopic.title}`,
          currentSection: section.title,
          currentSubtopic: subtopic.title,
          estimatedTimeRemaining: this.calculateRemainingTime(currentProgress),
        });
      }
    }

    return currentProgress;
  }

  private async uploadAndUpdateDatabase(
    sections: any[],
    baseDir: string,
    progressId: string,
    courseId: string,
    sessionId: string,
    startProgress: number,
    progressRange: number
  ): Promise<number> {
    this.logger.log('Starting upload to MinIO and database updates...');

    let currentProgress = startProgress;

    for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex++) {
      const section = sections[sectionIndex];
      const subtopics = section.subtopics || [];

      for (let subtopicIndex = 0; subtopicIndex < subtopics.length; subtopicIndex++) {
        const subtopic = subtopics[subtopicIndex];

        // Find video file
        const videoFile = path.join(baseDir, 'videos', section.title, `${subtopic.title.replace(/[^a-zA-Z0-9]/g, '_')}.mp4`);

        if (await fs.pathExists(videoFile)) {
          // Upload to MinIO
          const videoBuffer = await fs.readFile(videoFile);
          const objectKey = `courses/${courseId}/videos/${section.title}/${subtopic.title.replace(/[^a-zA-Z0-9]/g, '_')}.mp4`;

          await this.minioService.uploadFile(
            MINIO_BUCKETS.COURSES,
            objectKey,
            videoBuffer,
            'video/mp4'
          );

          // Update database with video URL
          const videoUrl = `${this.configService.get('MINIO_ENDPOINT')}/${MINIO_BUCKETS.COURSES}/${objectKey}`;
          await this.subtopicRepository.update(subtopic.id, {
            video_url: videoUrl,
            status: 'completed'
          });
        }

        // Update progress
        const stepProgress = ((sectionIndex * subtopics.length + subtopicIndex + 1) / this.getTotalSubtopics(sections)) * progressRange;
        currentProgress = startProgress + stepProgress;

        await this.updateProgress(progressId, {
          current_step: `uploading_${section.title}_${subtopic.title}`,
          progress_percentage: Math.floor(currentProgress),
        });

        this.emitProgress(courseId, sessionId, {
          progressPercentage: Math.floor(currentProgress),
          currentTask: `Uploading video for: ${section.title} - ${subtopic.title}`,
          currentSection: section.title,
          currentSubtopic: subtopic.title,
          estimatedTimeRemaining: this.calculateRemainingTime(currentProgress),
        });
      }
    }

    return currentProgress;
  }

  private async generatePostProcessingContent(
    sections: any[],
    baseDir: string,
    progressId: string,
    courseId: string,
    sessionId: string,
    roadmapData: any,
    startProgress: number,
    progressRange: number
  ): Promise<void> {
    this.logger.log('Starting post-processing: embeddings, quizzes, and flashcards...');

    try {
      // Step 1: Generate vector embeddings (95-97%)
      await this.updateProgress(progressId, {
        current_step: 'generating_embeddings',
        progress_percentage: startProgress + 1,
      });

      this.emitProgress(courseId, sessionId, {
        progressPercentage: startProgress + 1,
        currentTask: 'Creating vector embeddings for AI-powered search...',
        estimatedTimeRemaining: this.calculateRemainingTime(startProgress + 1),
      });

      await this.embeddingsService.generateCourseEmbeddings(courseId, sections);

      // Step 2: Generate assessments (97-98%)
      await this.updateProgress(progressId, {
        current_step: 'generating_assessments',
        progress_percentage: startProgress + 2,
      });

      this.emitProgress(courseId, sessionId, {
        progressPercentage: startProgress + 2,
        currentTask: 'Creating quizzes and flashcards...',
        estimatedTimeRemaining: this.calculateRemainingTime(startProgress + 2),
      });

      await this.assessmentService.generateCourseAssessments(courseId, sections);

      // Step 3: Initialize AI Buddy (98-99%)
      await this.updateProgress(progressId, {
        current_step: 'initializing_ai_buddy',
        progress_percentage: startProgress + 3,
      });

      this.emitProgress(courseId, sessionId, {
        progressPercentage: startProgress + 3,
        currentTask: 'Setting up AI Buddy assistant...',
        estimatedTimeRemaining: this.calculateRemainingTime(startProgress + 3),
      });

      await this.aiBuddyService.initializeAIBuddyForCourse(courseId);

      // Step 4: Final cleanup and completion (99-100%)
      await this.updateProgress(progressId, {
        current_step: 'finalizing',
        progress_percentage: startProgress + 4,
      });

      this.emitProgress(courseId, sessionId, {
        progressPercentage: startProgress + 4,
        currentTask: 'Finalizing course setup...',
        estimatedTimeRemaining: this.calculateRemainingTime(startProgress + 4),
      });

      this.logger.log(`Completed post-processing for course: ${courseId}`);

    } catch (error) {
      this.logger.error(`Post-processing failed for course ${courseId}:`, error);

      await this.updateProgress(progressId, {
        error_log: [{
          timestamp: new Date().toISOString(),
          error: error.message,
          step: 'post_processing'
        }],
      });

      this.emitProgress(courseId, sessionId, {
        progressPercentage: startProgress,
        currentTask: 'Post-processing failed',
        estimatedTimeRemaining: 0,
        errors: [{ step: 'post_processing', error: error.message, timestamp: new Date().toISOString() }],
      });

      throw error;
    }
  }

  // Helper methods

  private async generateSubtopicMarkdown(params: {
    sectionTitle: string;
    subtopicTitle: string;
    roadmapJson: string;
    prevSummary: string;
    nextSummary: string;
  }): Promise<string> {
    const prompt = [
      'Role: You are an expert educator writing a comprehensive, approachable subtopic guide in Markdown.',
      'Return ONLY Markdown. No YAML frontmatter. No extra commentary.',
      '',
      `Section: ${params.sectionTitle}`,
      `Subtopic: ${params.subtopicTitle}`,
      `Roadmap context: ${params.roadmapJson}`,
      `Previous summary: ${params.prevSummary}`,
      `Next summary: ${params.nextSummary}`,
      '',
      'Structure:',
      '# {{title}}',
      '',
      '## Previously Covered',
      '- Brief recap of previous content',
      '',
      '## Deep Dive',
      'Comprehensive explanation of the current topic...',
      '',
      '## Best Practices and Common Pitfalls',
      '- Key best practices',
      '- Common mistakes to avoid',
      '',
      '## Coming Up Next',
      '- Preview of next topics',
      '',
      '## Practice Exercises',
      '- Hands-on tasks',
      '- Code examples (if applicable)',
    ].join('\n');

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 3000,
      temperature: 0.7,
    });

    return response.choices[0]?.message?.content || '';
  }

  private async generateTimestampedTranscript(
    subtopicTitle: string,
    sectionTitle: string,
    markdownContent: string
  ): Promise<string> {
    const prompt = [
      'Role: You are a lecturer creating a timestamped transcript for video narration.',
      'Output format: [MM:SS] Narration text',
      '',
      `Title: ${subtopicTitle}`,
      `Section: ${sectionTitle}`,
      '',
      'Markdown content to narrate:',
      markdownContent,
      '',
      'Create a natural, engaging narration with timestamps every 10-15 seconds.',
      'Start with [00:00] and increment realistically.',
      'Example format:',
      '[00:00] Welcome to our lesson on {{topic}}...',
      '[00:15] In the previous section, we covered...',
      '[00:30] Today, we\'ll dive deep into...',
    ].join('\n');

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 2000,
      temperature: 0.4,
    });

    return response.choices[0]?.message?.content || '';
  }

  private async generateSubtitleNarratedAudio(
    transcriptContent: string,
    baseDir: string,
    sectionTitle: string,
    subtopicTitle: string
  ): Promise<string> {
    const audioDir = path.join(baseDir, 'audio', sectionTitle);
    await fs.ensureDir(audioDir);

    const lines = transcriptContent.split('\n').filter(line => line.trim());
    const audioClips: { timestamp: number; file: string; duration: number }[] = [];

    for (const line of lines) {
      const timestampMatch = line.match(/\[(\d{2}):(\d{2})\]\s*(.+)/);
      if (timestampMatch) {
        const [, minutes, seconds, text] = timestampMatch;
        const timestamp = parseInt(minutes) * 60 + parseInt(seconds);

        // Generate audio clip using OpenAI TTS
        const mp3Response = await this.openai.audio.speech.create({
          model: 'tts-1',
          voice: 'alloy',
          input: text.trim(),
        });

        const clipFile = path.join(audioDir, `clip_${timestamp}.mp3`);
        const buffer = Buffer.from(await mp3Response.arrayBuffer());
        await fs.writeFile(clipFile, buffer);

        // Estimate duration (rough calculation: 150 words per minute)
        const wordCount = text.split(' ').length;
        const estimatedDuration = (wordCount / 150) * 60;

        audioClips.push({
          timestamp,
          file: clipFile,
          duration: estimatedDuration
        });
      }
    }

    // Combine audio clips with proper timing
    const finalAudioFile = await this.combineAudioClips(audioClips, audioDir, subtopicTitle);
    return finalAudioFile;
  }

  private async combineAudioClips(
    clips: { timestamp: number; file: string; duration: number }[],
    audioDir: string,
    subtopicTitle: string
  ): Promise<string> {
    const outputFile = path.join(audioDir, `${subtopicTitle.replace(/[^a-zA-Z0-9]/g, '_')}.mp3`);

    // Create FFmpeg command to combine clips with proper timing
    let filterComplex = '';
    let inputs = '';

    clips.forEach((clip, index) => {
      inputs += `-i "${clip.file}" `;
      if (index === 0) {
        filterComplex += `[0:a]adelay=${clip.timestamp}s:all=1[a0];`;
      } else {
        filterComplex += `[${index}:a]adelay=${clip.timestamp}s:all=1[a${index}];`;
      }
    });

    // Combine all delayed audio streams
    const inputRefs = clips.map((_, index) => `[a${index}]`).join('');
    filterComplex += `${inputRefs}amix=inputs=${clips.length}:duration=longest[out]`;

    const command = `ffmpeg ${inputs} -filter_complex "${filterComplex}" -map "[out]" "${outputFile}"`;

    try {
      await execAsync(command);
      return outputFile;
    } catch (error) {
      this.logger.error('Failed to combine audio clips:', error);
      throw error;
    }
  }

  private async convertMarkdownToImages(
    markdownPath: string,
    baseDir: string,
    sectionTitle: string,
    subtopicTitle: string
  ): Promise<string> {
    const imagesDir = path.join(baseDir, 'images', sectionTitle, subtopicTitle.replace(/[^a-zA-Z0-9]/g, '_'));
    await fs.ensureDir(imagesDir);

    const command = `marp --images png --output "${imagesDir}" "${markdownPath}"`;

    try {
      await execAsync(command);
      return imagesDir;
    } catch (error) {
      this.logger.error('Failed to convert markdown to images:', error);
      throw error;
    }
  }

  private async compileVideoWithFFmpeg(
    audioPath: string,
    baseDir: string,
    sectionTitle: string,
    subtopicTitle: string
  ): Promise<string> {
    const videosDir = path.join(baseDir, 'videos', sectionTitle);
    await fs.ensureDir(videosDir);

    const imagesDir = path.join(baseDir, 'images', sectionTitle, subtopicTitle.replace(/[^a-zA-Z0-9]/g, '_'));
    const outputVideo = path.join(videosDir, `${subtopicTitle.replace(/[^a-zA-Z0-9]/g, '_')}.mp4`);

    // Create video from images and audio
    const command = [
      'ffmpeg',
      `-r 1/3`, // Show each image for 3 seconds
      `-i "${imagesDir}/%03d.png"`,
      `-i "${audioPath}"`,
      '-c:v libx264',
      '-c:a aac',
      '-shortest',
      '-pix_fmt yuv420p',
      `"${outputVideo}"`
    ].join(' ');

    try {
      await execAsync(command);
      return outputVideo;
    } catch (error) {
      this.logger.error('Failed to compile video:', error);
      throw error;
    }
  }

  private async cleanupLocalFiles(baseDir: string): Promise<void> {
    try {
      await fs.remove(baseDir);
      this.logger.log(`Cleaned up temporary files at: ${baseDir}`);
    } catch (error) {
      this.logger.error('Failed to cleanup local files:', error);
    }
  }

  // Utility methods

  private getSubtopicContext(sections: any[], sectionIndex: number, subtopicIndex: number): { prevSummary: string; nextSummary: string } {
    let prevSummary = '';
    let nextSummary = '';

    const currentSection = sections[sectionIndex];
    const subtopics = currentSection.subtopics || [];

    // Previous context
    if (subtopicIndex > 0) {
      // Previous subtopic in same section
      prevSummary = `Previous topic: ${subtopics[subtopicIndex - 1].title}`;
    } else if (sectionIndex > 0) {
      // Last subtopic of previous section
      const prevSection = sections[sectionIndex - 1];
      const prevSubtopics = prevSection.subtopics || [];
      if (prevSubtopics.length > 0) {
        prevSummary = `Previous section "${prevSection.title}" covered: ${prevSubtopics[prevSubtopics.length - 1].title}`;
      }
    }

    // Next context
    if (subtopicIndex < subtopics.length - 1) {
      // Next subtopic in same section
      nextSummary = `Next topic: ${subtopics[subtopicIndex + 1].title}`;
    } else if (sectionIndex < sections.length - 1) {
      // First subtopic of next section
      const nextSection = sections[sectionIndex + 1];
      const nextSubtopics = nextSection.subtopics || [];
      if (nextSubtopics.length > 0) {
        nextSummary = `Next section "${nextSection.title}" will cover: ${nextSubtopics[0].title}`;
      }
    }

    return { prevSummary, nextSummary };
  }

  private getTotalSubtopics(sections: any[]): number {
    return sections.reduce((total, section) => total + (section.subtopics?.length || 0), 0);
  }

  private getTotalSteps(sections: any[]): number {
    const totalSubtopics = this.getTotalSubtopics(sections);
    return totalSubtopics * 7; // 7 steps per subtopic
  }

  private async calculateEstimatedTime(roadmapData: any): Promise<number> {
    const totalSubtopics = Object.values(roadmapData).reduce((sum: number, subtopics: any) => sum + (subtopics?.length || 0), 0);
    return Number(totalSubtopics) * 8; // 8 minutes per subtopic
  }

  private calculateRemainingTime(currentProgress: number): number {
    const remainingPercentage = 100 - currentProgress;
    return Math.ceil((remainingPercentage / 100) * 60); // Rough estimate in minutes
  }

  private async updateProgress(progressId: string, updates: Partial<CourseGenerationProgress>): Promise<void> {
    try {
      await this.progressRepository.update(progressId, updates);
    } catch (error) {
      this.logger.error(`Failed to update progress ${progressId}:`, error);
    }
  }

  private emitProgress(courseId: string, sessionId: string, progressData: ProgressUpdate): void {
    try {
      this.websocketGateway.emitProgressUpdate(courseId, progressData);
    } catch (error) {
      this.logger.error('Failed to emit progress:', error);
    }
  }

  @OnWorkerEvent('completed')
  onCompleted({ jobId }: { jobId: string }) {
    this.logger.log(`Content generation job completed: ${jobId}`);
  }

  @OnWorkerEvent('failed')
  onFailed({ jobId, failedReason }: { jobId: string; failedReason: string }) {
    this.logger.error(`Content generation job failed: ${jobId}, reason: ${failedReason}`);
  }
}