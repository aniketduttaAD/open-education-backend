import { Processor, WorkerHost, OnWorkerEvent } from "@nestjs/bullmq";
import { Job } from "bullmq";
import { Logger, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, In } from "typeorm";
import * as fs from "fs-extra";
import * as path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import OpenAI from "openai";
import { ConfigService } from "@nestjs/config";
import { WebSocketGateway } from "../../websocket/websocket.gateway";
import { MinioService } from "../../storage/services/minio.service";
import { EmbeddingsService } from "../../ai/services/embeddings.service";
import { AIBuddyService } from "../../ai/services/ai-buddy.service";
import { AssessmentGenerationService } from "../../ai/services/assessment-generation.service";
import {
  Course,
  CourseGenerationProgress,
  CourseSection,
  CourseSubtopic,
  CourseRoadmap,
} from "../../courses/entities";
import { Quiz, QuizQuestion, Flashcard } from "../../assessments/entities";
import { VectorEmbedding } from "../../ai/entities/vector-embedding.entity";
import { ProgressUpdate } from "../../websocket/interfaces/progress-update.interface";
import { MINIO_BUCKETS } from "../../../config/minio.config";

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
@Processor("content-generation")
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
    @InjectRepository(Course)
    private readonly courseRepository: Repository<Course>,
    @InjectRepository(CourseRoadmap)
    private readonly roadmapRepository: Repository<CourseRoadmap>,
    @InjectRepository(Quiz)
    private readonly quizRepository: Repository<Quiz>,
    @InjectRepository(QuizQuestion)
    private readonly quizQuestionRepository: Repository<QuizQuestion>,
    @InjectRepository(Flashcard)
    private readonly flashcardRepository: Repository<Flashcard>,
    @InjectRepository(VectorEmbedding)
    private readonly embeddingRepository: Repository<VectorEmbedding>
  ) {
    super();
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>("OPENAI_API_KEY"),
    });
  }

  async process(job: Job<any, any, string>): Promise<any> {
    const { courseId, roadmapId, progressId, roadmapData, sessionId, tutorId } =
      job.data;

    // Check retry count - stop after 3 attempts
    const attemptCount = job.attemptsMade || 0;
    if (attemptCount >= 3) {
      this.logger.error(
        `Content generation failed permanently after ${attemptCount} attempts for course ${courseId}`
      );
      throw new Error(
        `Content generation failed permanently after ${attemptCount} attempts`
      );
    }

    this.logger.log(
      `Starting course content generation for course: ${courseId} (attempt ${
        attemptCount + 1
      }/3)`
    );

    // Create course if courseId is null (for roadmap-based generation)
    let actualCourseId = courseId;
    if (!actualCourseId && tutorId) {
      this.logger.log(`Creating course for tutor: ${tutorId}`);
      const course = await this.courseRepository.save({
        title: `Course from ${roadmapId || 'Roadmap'}`,
        tutor_user_id: tutorId,
        price_inr: null
      });
      actualCourseId = course.id;
      this.logger.log(`Course created: ${actualCourseId}`);
    }

    const tempKey = actualCourseId
      ? String(actualCourseId)
      : `session_${String(sessionId || "unknown")}`;
    const baseDir = path.join(
      process.cwd(),
      "generated",
      "course-generation",
      tempKey
    );
    await fs.ensureDir(baseDir);

    try {
      // Initialize progress tracking
      await this.updateProgress(progressId, {
        status: "processing",
        current_step: "initializing",
        progress_percentage: 0,
      });

      this.emitProgress(courseId, sessionId, {
        progressPercentage: 0,
        currentTask: "Starting content generation pipeline...",
        estimatedTimeRemaining: await this.calculateEstimatedTime(roadmapData),
      });

      // Get course sections and subtopics from database. If none, derive from roadmapData.
      let sections: any[] = [];
      if (courseId) {
        sections = await this.sectionRepository.find({
          where: { course_id: courseId },
          relations: ["subtopics"],
          order: { index: "ASC" },
        });
      }

      if ((!sections || sections.length === 0) && roadmapData) {
        const entries = Object.entries(roadmapData || {});
        this.logger.log(`Processing roadmap data with ${entries.length} sections`);
        this.logger.debug(`Roadmap data structure:`, JSON.stringify(roadmapData, null, 2));
        
        let idx = 0;
        sections = entries.map(([title, subs]: any) => {
          this.logger.log(`Processing section: "${title}" with subtopics:`, subs);
          const subtopics = (Array.isArray(subs) ? subs : []).map(
            (t: string, i: number) => ({ id: undefined, title: String(t) })
          );
          this.logger.log(`Created ${subtopics.length} subtopics for section "${title}":`, subtopics.map(s => s.title));
          
          return {
            id: `temp_${idx++}`,
            title,
            subtopics,
          };
        });
      }

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
      this.logger.log(`Starting audio generation for ${sections.length} sections`);
      globalProgress = await this.generateAudioFiles(
        sections,
        baseDir,
        progressId,
        courseId,
        sessionId,
        45,
        20
      );
      this.logger.log(`Completed audio generation, progress: ${globalProgress}%`);

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

      // Step 6: Upload to MinIO and update database (75-85%)
      globalProgress = await this.uploadAndUpdateDatabase(
        sections,
        baseDir,
        progressId,
        actualCourseId,
        sessionId,
        75,
        10
      );

      // Step 7: Generate assessments (quizzes and flashcards) (85-90%)
      globalProgress = await this.generateAssessmentsForSections(
        sections,
        actualCourseId,
        progressId,
        85,
        5
      );

      // Step 8: Generate embeddings (90-95%)
      globalProgress = await this.generateEmbeddingsForCourse(
        sections,
        actualCourseId,
        progressId,
        90,
        5
      );

      // Step 9: Final processing and cleanup (95-100%)
      await this.generatePostProcessingContent(
        sections,
        baseDir,
        progressId,
        actualCourseId,
        sessionId,
        roadmapData,
        95,
        5
      );

      // Keep generated files for debugging and reuse
      // await this.cleanupLocalFiles(baseDir);

      await this.updateProgress(progressId, {
        status: "completed",
        current_step: "completed",
        progress_percentage: 100,
        completed_at: new Date(),
      });

      // Emit final completion payload with all generated content
      const finalPayload = await this.buildFinalPayload(
        sections,
        actualCourseId,
        sessionId,
        roadmapData
      );

      this.emitProgress(actualCourseId, sessionId, {
        progressPercentage: 100,
        currentTask: "Course generation completed successfully!",
        estimatedTimeRemaining: 0,
        finalPayload,
      });

      return {
        success: true,
        courseId: actualCourseId,
        totalSections: sections.length,
        finalPayload,
      };
    } catch (error) {
      this.logger.error(
        `Content generation failed for course ${courseId}:`,
        error
      );

      await this.updateProgress(progressId, {
        status: "failed",
        error_log: [
          {
            timestamp: new Date().toISOString(),
            error: error.message,
            step: "content_generation",
          },
        ],
      });

      this.emitProgress(courseId, sessionId, {
        progressPercentage: -1,
        currentTask: "Content generation failed",
        estimatedTimeRemaining: 0,
        errors: [
          {
            step: "content_generation",
            error: error.message,
            timestamp: new Date().toISOString(),
          },
        ],
      });

      // Keep generated files for debugging even on failure
      // await this.cleanupLocalFiles(baseDir);
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
    this.logger.log("Starting markdown file generation...");

    let currentProgress = startProgress;
    const sectionCount = sections.length;
    const processedSubtopics = new Set<string>(); // Track processed subtopics to avoid duplicates

    for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex++) {
      const section = sections[sectionIndex];
      const subtopics = section.subtopics || [];

      for (
        let subtopicIndex = 0;
        subtopicIndex < subtopics.length;
        subtopicIndex++
      ) {
        const subtopic = subtopics[subtopicIndex];
        const subtopicKey = `${section.title}::${subtopic.title}`;
        
        // Check if this subtopic has already been processed
        if (processedSubtopics.has(subtopicKey)) {
          this.logger.warn(`Skipping duplicate subtopic in markdown generation: "${subtopic.title}" in section "${section.title}"`);
          continue;
        }
        
        processedSubtopics.add(subtopicKey);

        // Calculate context summaries
        const { prevSummary, nextSummary } = this.getSubtopicContext(
          sections,
          sectionIndex,
          subtopicIndex
        );

        // Generate slides directly from transcript content
        const transcriptFile = path.join(
          baseDir,
          "transcripts",
          section.title,
          `${subtopic.title.replace(/[^a-zA-Z0-9]/g, "_")}.txt`
        );

        let markdownContent: string;
        if (await fs.pathExists(transcriptFile)) {
          // Generate slides based on actual transcript content
          markdownContent = await this.generateSlidesFromTranscript(transcriptFile, {
            sectionTitle: section.title,
            subtopicTitle: subtopic.title,
            roadmapJson: JSON.stringify(roadmapData),
            prevSummary,
            nextSummary,
          });
        } else {
          // Fallback to generic markdown if no transcript
          markdownContent = await this.generateSubtopicMarkdown({
            sectionTitle: section.title,
            subtopicTitle: subtopic.title,
            roadmapJson: JSON.stringify(roadmapData),
            prevSummary,
            nextSummary,
          });
        }

        // Save markdown file with Marp frontmatter
        const mdDir = path.join(baseDir, "markdown", section.title);
        await fs.ensureDir(mdDir);
        const mdFile = path.join(
          mdDir,
          `${subtopic.title.replace(/[^a-zA-Z0-9]/g, "_")}.md`
        );

        // Add Marp frontmatter with custom CSS to the markdown content
        const marpContent = `---
marp: true
theme: default
size: 1920x1080
paginate: true
style: |
  img {
    max-width: 100% !important;
    max-height: 80% !important;
    object-fit: contain !important;
    display: block !important;
    margin: 0 auto !important;
    padding: 20px !important;
  }
  section {
    display: flex !important;
    flex-direction: column !important;
    justify-content: center !important;
    align-items: center !important;
    text-align: center !important;
  }
---

${markdownContent}`;

        await fs.writeFile(mdFile, marpContent);

        // Update subtopic with markdown path
        if (subtopic.id) {
          await this.subtopicRepository.update(subtopic.id, {
            markdown_path: mdFile,
            status: "markdown_generated",
          });
        }

        // Also update the in-memory subtopic data for assessment generation
        subtopic.markdown_path = mdFile;

        // Update progress
        const stepProgress =
          ((sectionIndex * subtopics.length + subtopicIndex + 1) /
            this.getTotalSubtopics(sections)) *
          progressRange;
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
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    this.logger.log(`Completed transcript generation. Processed ${processedSubtopics.size} unique subtopics`);
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
    this.logger.log("Starting transcript generation...");

    let currentProgress = startProgress;
    const processedSubtopics = new Set<string>(); // Track processed subtopics to avoid duplicates

    for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex++) {
      const section = sections[sectionIndex];
      const subtopics = section.subtopics || [];

      for (
        let subtopicIndex = 0;
        subtopicIndex < subtopics.length;
        subtopicIndex++
      ) {
        const subtopic = subtopics[subtopicIndex];
        const subtopicKey = `${section.title}::${subtopic.title}`;
        
        // Check if this subtopic has already been processed
        if (processedSubtopics.has(subtopicKey)) {
          this.logger.warn(`Skipping duplicate subtopic in transcript generation: "${subtopic.title}" in section "${section.title}"`);
          continue;
        }
        
        processedSubtopics.add(subtopicKey);

        // Read the generated markdown - construct path if not set
        const mdFile =
          subtopic.markdown_path ||
          path.join(
            baseDir,
            "markdown",
            section.title,
            `${subtopic.title.replace(/[^a-zA-Z0-9]/g, "_")}.md`
          );
        const markdownContent = await fs.readFile(mdFile, "utf8");

        // Generate transcript with timestamps
        const transcript = await this.generateTimestampedTranscript(
          subtopic.title,
          section.title,
          markdownContent
        );

        // Save transcript file
        const transcriptDir = path.join(baseDir, "transcripts", section.title);
        await fs.ensureDir(transcriptDir);
        const transcriptFile = path.join(
          transcriptDir,
          `${subtopic.title.replace(/[^a-zA-Z0-9]/g, "_")}.txt`
        );
        await fs.writeFile(transcriptFile, transcript);

        // Update subtopic with transcript path
        if (subtopic.id) {
          await this.subtopicRepository.update(subtopic.id, {
            transcript_path: transcriptFile,
            status: "transcript_generated",
          });
        }

        // Also update the in-memory subtopic data for assessment generation
        subtopic.transcript_path = transcriptFile;

        // Update progress
        const stepProgress =
          ((sectionIndex * subtopics.length + subtopicIndex + 1) /
            this.getTotalSubtopics(sections)) *
          progressRange;
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

        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    this.logger.log(`Completed transcript generation. Processed ${processedSubtopics.size} unique subtopics`);
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
    this.logger.log("Starting audio generation with subtitle timing...");

    // Log summary of what will be processed
    const totalSubtopics = this.getTotalSubtopics(sections);
    this.logger.log(`Will process ${totalSubtopics} subtopics across ${sections.length} sections`);
    sections.forEach((section, index) => {
      const subtopicCount = section.subtopics?.length || 0;
      this.logger.log(`Section ${index + 1}: "${section.title}" - ${subtopicCount} subtopics`);
    });

    let currentProgress = startProgress;
    const processedSubtopics = new Set<string>(); // Track processed subtopics to avoid duplicates

    for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex++) {
      const section = sections[sectionIndex];
      const subtopics = section.subtopics || [];
      
      this.logger.log(`Processing section ${sectionIndex + 1}/${sections.length}: "${section.title}" with ${subtopics.length} subtopics`);

      for (
        let subtopicIndex = 0;
        subtopicIndex < subtopics.length;
        subtopicIndex++
      ) {
        const subtopic = subtopics[subtopicIndex];
        const subtopicKey = `${section.title}::${subtopic.title}`;
        
        // Check if this subtopic has already been processed
        if (processedSubtopics.has(subtopicKey)) {
          this.logger.warn(`Skipping duplicate subtopic: "${subtopic.title}" in section "${section.title}"`);
          continue;
        }
        
        processedSubtopics.add(subtopicKey);
        this.logger.log(`Processing subtopic ${subtopicIndex + 1}/${subtopics.length}: "${subtopic.title}"`);

        try {
          this.logger.log(`Processing audio for subtopic: ${section.title} - ${subtopic.title}`);

          // Read transcript - construct path if not set
          const transcriptFile =
            subtopic.transcript_path ||
            path.join(
              baseDir,
              "transcripts",
              section.title,
              `${subtopic.title.replace(/[^a-zA-Z0-9]/g, "_")}.txt`
            );
          
          if (!(await fs.pathExists(transcriptFile))) {
            this.logger.error(`Transcript file not found: ${transcriptFile}`);
            throw new Error(`Transcript file not found: ${transcriptFile}`);
          }

          const transcriptContent = await fs.readFile(transcriptFile, "utf8");

          // Generate audio with subtitle timing and timeout
          const audioFile = await this.generateSubtitleNarratedAudioWithTimeout(
            transcriptContent,
            baseDir,
            section.title,
            subtopic.title
          );

          // Update subtopic with audio path
          if (subtopic.id) {
            await this.subtopicRepository.update(subtopic.id, {
              audio_path: audioFile,
              status: "audio_generated",
            });
          }

          this.logger.log(`Successfully generated audio for: ${section.title} - ${subtopic.title}`);

        } catch (error) {
          this.logger.error(`Failed to generate audio for ${section.title} - ${subtopic.title}:`, error);
          
          // Continue with next subtopic instead of failing completely
          this.emitProgress(courseId, sessionId, {
            progressPercentage: Math.floor(currentProgress),
            currentTask: `Skipping audio generation for: ${section.title} - ${subtopic.title} (error occurred)`,
            currentSection: section.title,
            currentSubtopic: subtopic.title,
            estimatedTimeRemaining: this.calculateRemainingTime(currentProgress),
            errors: [{
              step: "audio_generation",
              error: error.message,
              timestamp: new Date().toISOString(),
            }]
          });
          
          // Update subtopic status to indicate failure
          if (subtopic.id) {
            await this.subtopicRepository.update(subtopic.id, {
              status: "audio_generation_failed",
            });
          }
        }

        // Update progress
        const stepProgress =
          ((sectionIndex * subtopics.length + subtopicIndex + 1) /
            this.getTotalSubtopics(sections)) *
          progressRange;
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

        await new Promise((resolve) => setTimeout(resolve, 2000)); // Longer delay for TTS
      }
    }

    this.logger.log(`Completed audio generation. Processed ${processedSubtopics.size} unique subtopics`);
    return currentProgress;
  }

  /**
   * Generate audio with timeout protection
   */
  private async generateSubtitleNarratedAudioWithTimeout(
    transcriptContent: string,
    baseDir: string,
    sectionTitle: string,
    subtopicTitle: string
  ): Promise<string> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Audio generation timeout for ${subtopicTitle} after 10 minutes`)), 600000);
    });

    const audioPromise = this.generateSubtitleNarratedAudio(
      transcriptContent,
      baseDir,
      sectionTitle,
      subtopicTitle
    );

    return Promise.race([audioPromise, timeoutPromise]);
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
    this.logger.log("Starting image generation using Marp CLI...");

    let currentProgress = startProgress;

    for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex++) {
      const section = sections[sectionIndex];
      const subtopics = section.subtopics || [];

      for (
        let subtopicIndex = 0;
        subtopicIndex < subtopics.length;
        subtopicIndex++
      ) {
        const subtopic = subtopics[subtopicIndex];

        // Use the original markdown file as single source of truth
        const mdFile = subtopic.markdown_path ||
          path.join(
            baseDir,
            "markdown",
            section.title,
            `${subtopic.title.replace(/[^a-zA-Z0-9]/g, "_")}.md`
          );

        // Ensure markdown has Marp frontmatter with custom CSS
        await this.ensureMarpFrontmatter(mdFile);

        // Convert markdown to images using Marp CLI
        const imagesDir = await this.convertMarkdownToImages(
          mdFile,
          baseDir,
          section.title,
          subtopic.title
        );

        // Update progress
        const stepProgress =
          ((sectionIndex * subtopics.length + subtopicIndex + 1) /
            this.getTotalSubtopics(sections)) *
          progressRange;
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
    this.logger.log("Starting video compilation with FFmpeg...");

    let currentProgress = startProgress;

    for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex++) {
      const section = sections[sectionIndex];
      const subtopics = section.subtopics || [];

      for (
        let subtopicIndex = 0;
        subtopicIndex < subtopics.length;
        subtopicIndex++
      ) {
        const subtopic = subtopics[subtopicIndex];

        // Compile video using FFmpeg - construct path if not set
        const audioFile =
          subtopic.audio_path ||
          path.join(
            baseDir,
            "audio",
            section.title,
            `${subtopic.title.replace(/[^a-zA-Z0-9]/g, "_")}.mp3`
          );
        const videoFile = await this.compileVideoWithFFmpeg(
          audioFile,
          baseDir,
          section.title,
          subtopic.title
        );

        // Update progress
        const stepProgress =
          ((sectionIndex * subtopics.length + subtopicIndex + 1) /
            this.getTotalSubtopics(sections)) *
          progressRange;
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
    this.logger.log("Starting upload to MinIO and database updates...");

    let currentProgress = startProgress;

    // Create course sections and subtopics in database
    for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex++) {
      const section = sections[sectionIndex];
      
      // Create section in database
      const dbSection = await this.sectionRepository.save({
        course_id: courseId,
        index: sectionIndex + 1,
        title: section.title
      });
      
      this.logger.log(`Created section: ${dbSection.id} - ${section.title}`);

      const subtopics = section.subtopics || [];

      for (let subtopicIndex = 0; subtopicIndex < subtopics.length; subtopicIndex++) {
        const subtopic = subtopics[subtopicIndex];

        // Find video file
        const videoFile = path.join(
          baseDir,
          "videos",
          section.title,
          `${subtopic.title.replace(/[^a-zA-Z0-9]/g, "_")}.mp4`
        );

        let videoUrl = null;
        if (await fs.pathExists(videoFile)) {
          const videoBuffer = await fs.readFile(videoFile);
          const safeName = subtopic.title.replace(/[^a-zA-Z0-9]/g, "_");
          const objectKey = `courses/${courseId}/videos/${section.title}/${safeName}.mp4`;

          const fileUrl = await this.minioService.uploadFile(
            MINIO_BUCKETS.COURSES,
            objectKey,
            videoBuffer,
            "video/mp4",
            true // Make videos publicly accessible
          );

          // Store video URL
          const endpoint =
            this.configService.get<string>("MINIO_ENDPOINT_EXTERNAL") ||
            this.configService.get<string>("MINIO_ENDPOINT") ||
            "";
          const proto =
            this.configService.get<string>("MINIO_USE_SSL") === "true"
              ? "https"
              : "http";
          const host = endpoint?.startsWith("http")
            ? endpoint
            : `${proto}://${endpoint}`;
          videoUrl = `${host}/${MINIO_BUCKETS.COURSES}/${objectKey}`;
          
          this.logger.log(`Video uploaded: ${videoUrl}`);
        }

        // Create subtopic in database
        const dbSubtopic = await this.subtopicRepository.save({
          section_id: dbSection.id,
          index: subtopicIndex + 1,
          title: subtopic.title,
          markdown_path: subtopic.markdownPath || null,
          transcript_path: subtopic.transcriptPath || null,
          audio_path: subtopic.audioPath || null,
          video_url: videoUrl,
          status: 'completed'
        });

        this.logger.log(`Created subtopic: ${dbSubtopic.id} - ${subtopic.title}`);

        // Store database IDs in section data for later use
        subtopic.dbId = dbSubtopic.id;
        subtopic.videoUrl = videoUrl;

        // Update progress
        const stepProgress =
          ((sectionIndex * subtopics.length + subtopicIndex + 1) /
            this.getTotalSubtopics(sections)) *
          progressRange;
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

  /**
   * Generate quizzes and flashcards for each section
   */
  private async generateAssessmentsForSections(
    sections: any[],
    courseId: string,
    progressId: string,
    startProgress: number,
    progressRange: number
  ): Promise<number> {
    this.logger.log("Starting assessment generation...");

    let currentProgress = startProgress;

    for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex++) {
      const section = sections[sectionIndex];
      
      // Get section from database
      const dbSection = await this.sectionRepository.findOne({
        where: { course_id: courseId, title: section.title }
      });

      if (!dbSection) {
        this.logger.warn(`Section not found in database: ${section.title}`);
        continue;
      }

      // Generate 1 flashcard per section
      try {
        const flashcardData = await this.generateFlashcardForSection(section);
        if (flashcardData) {
          await this.flashcardRepository.save({
            course_id: courseId,
            section_id: dbSection.id,
            index: 1,
            front: flashcardData.front,
            back: flashcardData.back
          });
          this.logger.log(`Created flashcard for section: ${section.title}`);
        }
      } catch (error) {
        this.logger.error(`Failed to create flashcard for section ${section.title}:`, error);
      }

      // Generate 5-8 quizzes per section
      try {
        const quizData = await this.generateQuizForSection(section);
        if (quizData && quizData.questions.length > 0) {
          const quiz = await this.quizRepository.save({
            course_id: courseId,
            section_id: dbSection.id,
            title: `Quiz: ${section.title}`
          });

          // Create quiz questions
          for (let i = 0; i < quizData.questions.length; i++) {
            const question = quizData.questions[i];
            await this.quizQuestionRepository.save({
              quiz_id: quiz.id,
              index: i + 1,
              question: question.question,
              options: question.options,
              correct_index: question.correct_index
            });
          }
          this.logger.log(`Created quiz with ${quizData.questions.length} questions for section: ${section.title}`);
        }
      } catch (error) {
        this.logger.error(`Failed to create quiz for section ${section.title}:`, error);
      }

      // Update progress
      const stepProgress = ((sectionIndex + 1) / sections.length) * progressRange;
      currentProgress = startProgress + stepProgress;

      await this.updateProgress(progressId, {
        current_step: `generating_assessments_${section.title}`,
        progress_percentage: Math.floor(currentProgress),
      });

      this.emitProgress(courseId, null, {
        progressPercentage: Math.floor(currentProgress),
        currentTask: `Generating assessments for: ${section.title}`,
        currentSection: section.title,
        estimatedTimeRemaining: this.calculateRemainingTime(currentProgress),
      });
    }

    this.logger.log("Assessment generation completed");
    return currentProgress;
  }

  /**
   * Generate a single flashcard for a section
   */
  private async generateFlashcardForSection(section: any): Promise<{ front: string; back: string } | null> {
    try {
      // Collect content from markdown and transcript files
      let content = '';
      
      for (const subtopic of section.subtopics || []) {
        if (subtopic.markdown_path && await fs.pathExists(subtopic.markdown_path)) {
          content += await fs.readFile(subtopic.markdown_path, 'utf8') + '\n';
        }
        if (subtopic.transcript_path && await fs.pathExists(subtopic.transcript_path)) {
          content += await fs.readFile(subtopic.transcript_path, 'utf8') + '\n';
        }
      }

      if (!content.trim()) {
        this.logger.warn(`No content found for section: ${section.title}`);
        return null;
      }

      const prompt = `Based on the following content about "${section.title}", create a single flashcard with a concise question on the front and a clear answer on the back.

Content:
${content.substring(0, 2000)} // Limit content to avoid token limits

Format your response as JSON:
{
  "front": "Question here",
  "back": "Answer here"
}`;

      const response = await this.openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        max_tokens: 300
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      return result.front && result.back ? result : null;
    } catch (error) {
      this.logger.error(`Failed to generate flashcard for section ${section.title}:`, error);
      return null;
    }
  }

  /**
   * Generate quiz questions for a section
   */
  private async generateQuizForSection(section: any): Promise<{ questions: any[] } | null> {
    try {
      // Collect content from markdown and transcript files
      let content = '';
      
      for (const subtopic of section.subtopics || []) {
        if (subtopic.markdown_path && await fs.pathExists(subtopic.markdown_path)) {
          content += await fs.readFile(subtopic.markdown_path, 'utf8') + '\n';
        }
        if (subtopic.transcript_path && await fs.pathExists(subtopic.transcript_path)) {
          content += await fs.readFile(subtopic.transcript_path, 'utf8') + '\n';
        }
      }

      if (!content.trim()) {
        this.logger.warn(`No content found for section: ${section.title}`);
        return null;
      }

      const prompt = `Based on the following content about "${section.title}", create 5-8 quiz questions with 4 multiple choice options each. Include both correct and incorrect options.

Content:
${content.substring(0, 3000)} // Limit content to avoid token limits

Format your response as JSON:
{
  "questions": [
    {
      "question": "Question text here",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correct_index": 0
    }
  ]
}`;

      const response = await this.openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        max_tokens: 1500
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      return result.questions && result.questions.length > 0 ? result : null;
    } catch (error) {
      this.logger.error(`Failed to generate quiz for section ${section.title}:`, error);
      return null;
    }
  }

  /**
   * Generate embeddings for the complete course
   */
  private async generateEmbeddingsForCourse(
    sections: any[],
    courseId: string,
    progressId: string,
    startProgress: number,
    progressRange: number
  ): Promise<number> {
    this.logger.log("Starting embeddings generation...");

    let currentProgress = startProgress;

    try {
      // Collect all content for embeddings
      let allContent = '';
      const contentChunks = [];

      for (const section of sections) {
        let sectionContent = '';
        
        for (const subtopic of section.subtopics || []) {
          if (subtopic.markdownPath && await fs.pathExists(subtopic.markdownPath)) {
            const markdownContent = await fs.readFile(subtopic.markdownPath, 'utf8');
            sectionContent += markdownContent + '\n';
            allContent += markdownContent + '\n';
            
            // Create chunk for subtopic
            contentChunks.push({
              type: 'subtopic',
              sectionTitle: section.title,
              subtopicTitle: subtopic.title,
              content: markdownContent.substring(0, 1000) // Limit chunk size
            });
          }
          
          if (subtopic.transcriptPath && await fs.pathExists(subtopic.transcriptPath)) {
            const transcriptContent = await fs.readFile(subtopic.transcriptPath, 'utf8');
            sectionContent += transcriptContent + '\n';
            allContent += transcriptContent + '\n';
          }
        }

        // Create chunk for section
        if (sectionContent.trim()) {
          contentChunks.push({
            type: 'section',
            sectionTitle: section.title,
            content: sectionContent.substring(0, 1500) // Limit chunk size
          });
        }
      }

      // Create course-level embedding
      if (allContent.trim()) {
        const courseEmbedding = await this.generateEmbedding(allContent.substring(0, 2000));
        await this.embeddingRepository.save({
          course_id: courseId,
          kind: 'course',
          content_hash: this.generateContentHash(allContent),
          embedding: courseEmbedding
        });
        this.logger.log(`Created course-level embedding`);
      }

      // Create embeddings for each chunk
      for (let i = 0; i < contentChunks.length; i++) {
        const chunk = contentChunks[i];
        const embedding = await this.generateEmbedding(chunk.content);
        
        const embeddingData: any = {
          course_id: courseId,
          kind: chunk.type,
          content_hash: this.generateContentHash(chunk.content),
          embedding: embedding
        };

        // Add section/subtopic references if available
        if (chunk.type === 'subtopic') {
          const dbSection = await this.sectionRepository.findOne({
            where: { course_id: courseId, title: chunk.sectionTitle }
          });
          if (dbSection) {
            embeddingData.section_id = dbSection.id;
          }
        }

        await this.embeddingRepository.save(embeddingData);

        // Update progress
        const stepProgress = ((i + 1) / contentChunks.length) * progressRange;
        currentProgress = startProgress + stepProgress;

        await this.updateProgress(progressId, {
          current_step: `generating_embeddings_${chunk.type}`,
          progress_percentage: Math.floor(currentProgress),
        });

        this.emitProgress(courseId, null, {
          progressPercentage: Math.floor(currentProgress),
          currentTask: `Generating embeddings for: ${chunk.sectionTitle}`,
          currentSection: chunk.sectionTitle,
          estimatedTimeRemaining: this.calculateRemainingTime(currentProgress),
        });
      }

      this.logger.log(`Created ${contentChunks.length + 1} embeddings for course`);
    } catch (error) {
      this.logger.error(`Failed to generate embeddings:`, error);
    }

    return currentProgress;
  }

  /**
   * Generate embedding using OpenAI
   */
  private async generateEmbedding(text: string): Promise<string> {
    try {
      const response = await this.openai.embeddings.create({
        model: "text-embedding-3-small",
        input: text
      });
      
      return JSON.stringify(response.data[0].embedding);
    } catch (error) {
      this.logger.error(`Failed to generate embedding:`, error);
      throw error;
    }
  }

  /**
   * Generate content hash for deduplication
   */
  private generateContentHash(content: string): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(content).digest('hex');
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
    this.logger.log(
      `Starting post-processing: embeddings, quizzes, and flashcards for course=${courseId} session=${sessionId}`
    );

    try {
      // Step 1: Generate vector embeddings (95-97%)
      this.logger.debug(
        `Embeddings: begin course=${courseId}, sections=${sections.length}`
      );
      await this.updateProgress(progressId, {
        current_step: "generating_embeddings",
        progress_percentage: startProgress + 1,
      });

      this.emitProgress(courseId, sessionId, {
        progressPercentage: startProgress + 1,
        currentTask: "Creating vector embeddings for AI-powered search...",
        estimatedTimeRemaining: this.calculateRemainingTime(startProgress + 1),
      });

      await this.embeddingsService.generateCourseEmbeddings(courseId, sections);
      this.logger.debug(`Embeddings: done course=${courseId}`);

      // Step 2: Generate assessments (97-98%)
      this.logger.debug(`Assessments: begin course=${courseId}`);
      await this.updateProgress(progressId, {
        current_step: "generating_assessments",
        progress_percentage: startProgress + 2,
      });

      this.emitProgress(courseId, sessionId, {
        progressPercentage: startProgress + 2,
        currentTask: "Creating quizzes and flashcards...",
        estimatedTimeRemaining: this.calculateRemainingTime(startProgress + 2),
      });

      await this.assessmentService.generateCourseAssessments(
        courseId,
        sections
      );
      this.logger.debug(`Assessments: done course=${courseId}`);

      // Step 3: Initialize AI Buddy (98-99%)
      this.logger.debug(`AI Buddy: init course=${courseId}`);
      await this.updateProgress(progressId, {
        current_step: "initializing_ai_buddy",
        progress_percentage: startProgress + 3,
      });

      this.emitProgress(courseId, sessionId, {
        progressPercentage: startProgress + 3,
        currentTask: "Setting up AI Buddy assistant...",
        estimatedTimeRemaining: this.calculateRemainingTime(startProgress + 3),
      });

      await this.aiBuddyService.initializeAIBuddyForCourse(courseId);
      this.logger.debug(`AI Buddy: initialized course=${courseId}`);

      // Step 4: Final cleanup and completion (99-100%)
      await this.updateProgress(progressId, {
        current_step: "finalizing",
        progress_percentage: startProgress + 4,
      });

      this.emitProgress(courseId, sessionId, {
        progressPercentage: startProgress + 4,
        currentTask: "Finalizing course setup...",
        estimatedTimeRemaining: this.calculateRemainingTime(startProgress + 4),
      });

      this.logger.log(`Completed post-processing for course: ${courseId}`);
    } catch (error) {
      this.logger.error(
        `Post-processing failed for course ${courseId}:`,
        error
      );

      await this.updateProgress(progressId, {
        error_log: [
          {
            timestamp: new Date().toISOString(),
            error: error.message,
            step: "post_processing",
          },
        ],
      });

      this.emitProgress(courseId, sessionId, {
        progressPercentage: startProgress,
        currentTask: "Post-processing failed",
        estimatedTimeRemaining: 0,
        errors: [
          {
            step: "post_processing",
            error: error.message,
            timestamp: new Date().toISOString(),
          },
        ],
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
      "Role: You are an expert educator writing a comprehensive, approachable subtopic guide in Markdown for Marp presentation slides.",
      "Return ONLY Markdown with proper slide breaks (---) between sections. No CSS styling needed - it will be handled automatically.",
      "",
      `Section: ${params.sectionTitle}`,
      `Subtopic: ${params.subtopicTitle}`,
      `Roadmap context: ${params.roadmapJson}`,
      `Previous summary: ${params.prevSummary}`,
      `Next summary: ${params.nextSummary}`,
      "",
      "Structure each section as a separate slide with --- separators:",
      "# {{title}}",
      "",
      "---",
      "",
      "## Previously Covered",
      "- Brief recap of previous content",
      "",
      "---",
      "",
      "## Deep Dive",
      "Comprehensive explanation of the current topic...",
      "",
      "---",
      "",
      "## Best Practices and Common Pitfalls",
      "- Key best practices",
      "- Common mistakes to avoid",
      "",
      "---",
      "",
      "## Coming Up Next",
      "- Preview of next topics",
      "",
      "---",
      "",
      "## Practice Exercises",
      "- Hands-on tasks",
      "- Code examples (if applicable)",
    ].join("\n");

    const response = await this.openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 3000,
      temperature: 0.7,
    });

    return response.choices[0]?.message?.content || "";
  }

  /**
   * Ensure markdown file has proper Marp frontmatter with custom CSS
   */
  private async ensureMarpFrontmatter(mdFile: string): Promise<void> {
    try {
      const content = await fs.readFile(mdFile, 'utf8');
      
      // Check if file already has Marp frontmatter
      if (content.startsWith('---\nmarp: true')) {
        this.logger.log(`Markdown file already has Marp frontmatter: ${mdFile}`);
        return;
      }

      // Add Marp frontmatter with custom CSS
      const marpContent = `---
marp: true
theme: default
size: 1920x1080
paginate: true
style: |
  img {
    max-width: 100% !important;
    max-height: 80% !important;
    object-fit: contain !important;
    display: block !important;
    margin: 0 auto !important;
    padding: 20px !important;
  }
  section {
    display: flex !important;
    flex-direction: column !important;
    justify-content: center !important;
    align-items: center !important;
    text-align: center !important;
  }
---

${content}`;

      await fs.writeFile(mdFile, marpContent);
      this.logger.log(`Added Marp frontmatter to: ${mdFile}`);
    } catch (error) {
      this.logger.error(`Failed to ensure Marp frontmatter for ${mdFile}:`, error);
    }
  }

  private async generateSlidesFromTranscript(
    transcriptFile: string,
    params: {
      sectionTitle: string;
      subtopicTitle: string;
      roadmapJson: string;
      prevSummary: string;
      nextSummary: string;
    }
  ): Promise<string> {
    try {
      const transcriptContent = await fs.readFile(transcriptFile, "utf8");
      const lines = transcriptContent.split("\n");
      
      // Parse transcript segments
      const transcriptSegments: { start: number; end: number; content: string }[] = [];
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        const timestampMatch = line.match(/^\[(\d{1,2}):(\d{2})(?::(\d{2}))?\]\s*(.+)$/);
        if (timestampMatch) {
          const [, minutes, seconds, hours, content] = timestampMatch;
          const totalSeconds = hours ? 
            (parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseInt(seconds)) :
            (parseInt(minutes) * 60 + parseInt(seconds));
          
          // Find the next timestamp to determine end time
          let endTime = totalSeconds + 15; // Default 15 seconds if no next timestamp
          for (let j = i + 1; j < lines.length; j++) {
            const nextLine = lines[j].trim();
            const nextTimestampMatch = nextLine.match(/^\[(\d{1,2}):(\d{2})(?::(\d{2}))?\]/);
            if (nextTimestampMatch) {
              const [, nextMinutes, nextSeconds, nextHours] = nextTimestampMatch;
              endTime = nextHours ? 
                (parseInt(nextHours) * 3600 + parseInt(nextMinutes) * 60 + parseInt(nextSeconds)) :
                (parseInt(nextMinutes) * 60 + parseInt(nextSeconds));
              break;
            }
          }
          
          transcriptSegments.push({
            start: totalSeconds,
            end: endTime,
            content: content.trim()
          });
        }
      }

      if (transcriptSegments.length === 0) {
        throw new Error("No valid transcript segments found");
      }

      // Group segments into logical slide groups
      const slideGroups = this.groupTranscriptSegmentsIntoSlides(transcriptSegments);
      
      // Generate markdown for each slide group
      const slides = slideGroups.map((group, index) => {
        const slideTitle = this.getSlideTitleFromContent(group.content, index, slideGroups.length);
        const slideContent = this.formatSlideContent(group.content, group.segments);
        return `## ${slideTitle}\n\n${slideContent}`;
      });

      // Create the complete markdown
      const titleSlide = `# ${params.subtopicTitle}`;
      const completeMarkdown = [titleSlide, ...slides].join('\n\n---\n\n');

      this.logger.log(`Generated ${slides.length + 1} slides from ${transcriptSegments.length} transcript segments`);
      return completeMarkdown;

    } catch (error) {
      this.logger.error("Failed to generate slides from transcript:", error);
      // Fallback to generic markdown
      return await this.generateSubtopicMarkdown(params);
    }
  }

  private groupTranscriptSegmentsIntoSlides(segments: { start: number; end: number; content: string }[]): Array<{ content: string; segments: typeof segments }> {
    const slideGroups: Array<{ content: string; segments: typeof segments }> = [];
    
    // Define slide themes and their keywords
    const slideThemes = [
      { keywords: ['welcome', 'lesson', 'topic', 'exploration'], name: 'Introduction' },
      { keywords: ['previously', 'covered', 'recap', 'session'], name: 'Previously Covered' },
      { keywords: ['today', 'dive', 'deep', 'functions', 'anatomy', 'example'], name: 'Main Content' },
      { keywords: ['best practices', 'pitfalls', 'mistakes', 'avoid'], name: 'Best Practices' },
      { keywords: ['coming up', 'next', 'preview', 'explore'], name: 'Coming Up Next' },
      { keywords: ['practice', 'exercises', 'assignment', 'try'], name: 'Practice Exercises' }
    ];

    // Group segments by themes
    for (const theme of slideThemes) {
      const matchingSegments = segments.filter(segment => {
        const content = segment.content.toLowerCase();
        return theme.keywords.some(keyword => content.includes(keyword));
      });

      if (matchingSegments.length > 0) {
        slideGroups.push({
          content: theme.name,
          segments: matchingSegments
        });
      }
    }

    // If no themes matched, create groups based on time intervals
    if (slideGroups.length === 0) {
      const totalDuration = segments[segments.length - 1].end;
      const groupSize = Math.ceil(segments.length / 6); // Aim for 6 slides
      
      for (let i = 0; i < segments.length; i += groupSize) {
        const groupSegments = segments.slice(i, i + groupSize);
        slideGroups.push({
          content: `Content Section ${Math.floor(i / groupSize) + 1}`,
          segments: groupSegments
        });
      }
    }

    return slideGroups;
  }

  private getSlideTitleFromContent(content: string, index: number, totalSlides: number): string {
    // Use predefined titles based on content
    const titleMap: { [key: string]: string } = {
      'Introduction': 'Introduction',
      'Previously Covered': 'Previously Covered',
      'Main Content': 'Deep Dive',
      'Best Practices': 'Best Practices and Common Pitfalls',
      'Coming Up Next': 'Coming Up Next',
      'Practice Exercises': 'Practice Exercises'
    };

    return titleMap[content] || `Section ${index + 1}`;
  }

  private formatSlideContent(content: string, segments: { start: number; end: number; content: string }[]): string {
    // Combine segment content into readable slide content
    const combinedContent = segments.map(segment => segment.content).join(' ');
    
    // Format the content for better readability
    const formattedContent = combinedContent
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();

    // Add bullet points for better structure
    const sentences = formattedContent.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const bulletPoints = sentences.map(sentence => `- ${sentence.trim()}`).join('\n');

    return bulletPoints || formattedContent;
  }

  private async generateTimestampedTranscript(
    subtopicTitle: string,
    sectionTitle: string,
    markdownContent: string
  ): Promise<string> {
    const prompt = [
      "Role: You are a lecturer creating a timestamped transcript for video narration.",
      "Output format: [MM:SS] Narration text",
      "",
      `Title: ${subtopicTitle}`,
      `Section: ${sectionTitle}`,
      "",
      "Markdown content to narrate:",
      markdownContent,
      "",
      "Create a natural, engaging narration with timestamps every 10-15 seconds.",
      "Start with [00:00] and increment realistically.",
      "Example format:",
      "[00:00] Welcome to our lesson on {{topic}}...",
      "[00:15] In the previous section, we covered...",
      "[00:30] Today, we'll dive deep into...",
    ].join("\n");

    const response = await this.openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 2000,
      temperature: 0.4,
    });

    return response.choices[0]?.message?.content || "";
  }

  private async generateSubtitleNarratedAudio(
    transcriptContent: string,
    baseDir: string,
    sectionTitle: string,
    subtopicTitle: string
  ): Promise<string> {
    const audioDir = path.join(baseDir, "audio", sectionTitle);
    await fs.ensureDir(audioDir);

    // Support SRT or VTT style. Extract segments with start/end times.
    const segments: { startSec: number; endSec: number; text: string }[] = [];
    const lines = transcriptContent.split("\n");
    const timecode =
      /(?:(\d{2}):(\d{2}):(\d{2}),(\d{3}))|(?:(\d{2}):(\d{2})\.(\d{3}))/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      // SRT timing line: 00:00:10,000 --> 00:00:15,000
      if (line.includes("-->")) {
        const [startRaw, endRaw] = line.split("-->").map((s) => s.trim());
        const toMs = (raw: string): number => {
          // Try HH:MM:SS,mmm else MM:SS.mmm
          const m = raw.match(/(\d{2}):(\d{2}):(\d{2}),(\d{3})/);
          if (m) {
            const [, hh, mm, ss, ms] = m;
            return (
              (Number(hh) * 3600 + Number(mm) * 60 + Number(ss)) * 1000 +
              Number(ms)
            );
          }
          const m2 = raw.match(/(\d{2}):(\d{2})\.(\d{3})/);
          if (m2) {
            const [, mm, ss, ms] = m2;
            return (Number(mm) * 60 + Number(ss)) * 1000 + Number(ms);
          }
          return 0;
        };
        const startMs = toMs(startRaw);
        const endMs = toMs(endRaw);

        // Next non-empty lines until a blank line form the text
        let text = "";
        let j = i + 1;
        while (j < lines.length && lines[j].trim().length > 0) {
          // Skip pure index lines (SRT blocks often have numeric index)
          if (!/^\d+$/.test(lines[j].trim())) {
            text += (text ? " " : "") + lines[j].trim();
          }
          j++;
        }
        i = j;

        if (text) {
          segments.push({
            startSec: startMs / 1000,
            endSec: endMs / 1000,
            text,
          });
        }
      }
    }

    // Fallback: simple [MM:SS] parser if SRT/VTT not matched
    if (segments.length === 0) {
      const mmss = /\[(\d{2}):(\d{2})\]\s*(.+)/;
      for (const raw of lines) {
        const m = raw.match(mmss);
        if (m) {
          const [, mm, ss, text] = m;
          const start = Number(mm) * 60 + Number(ss);
          // Approximate 3s per line if no end
          segments.push({
            startSec: start,
            endSec: start + 3,
            text: text.trim(),
          });
        }
      }
    }

    // Generate TTS per segment and align with silences
    const audioClips: { timestamp: number; file: string; duration: number }[] =
      [];
    
    this.logger.log(`Generating TTS for ${segments.length} segments for ${subtopicTitle}`);
    
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      
      try {
        this.logger.debug(`Generating TTS for segment ${i + 1}/${segments.length}: "${seg.text.substring(0, 50)}..."`);
        
        // Add timeout to TTS generation (2 minutes per segment)
        const ttsTimeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error(`TTS timeout for segment ${i + 1} after 2 minutes`)), 120000);
        });
        
        const ttsPromise = this.openai.audio.speech.create({
          model: "tts-1",
          voice: "alloy",
          input: seg.text,
        });
        
        const mp3Response = await Promise.race([ttsPromise, ttsTimeoutPromise]);
        
        const clipFile = path.join(
          audioDir,
          `clip_${Math.round(seg.startSec * 1000)}.mp3`
        );
        const buffer = Buffer.from(await mp3Response.arrayBuffer());
        await fs.writeFile(clipFile, buffer);

        // Roughly probe duration by word count if ffprobe is unavailable in this context
        const words = seg.text.split(/\s+/).length;
        const estDur = Math.max(
          1,
          Math.min(seg.endSec - seg.startSec, (words / 150) * 60)
        );
        audioClips.push({
          timestamp: seg.startSec,
          file: clipFile,
          duration: estDur,
        });
        
        this.logger.debug(`Successfully generated TTS for segment ${i + 1}/${segments.length}`);
        
        // Add small delay between TTS requests to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (error) {
        this.logger.error(`Failed to generate TTS for segment ${i + 1}/${segments.length}:`, error);
        this.logger.warn(`Skipping segment ${i + 1} and continuing with remaining segments`);
        
        // Continue with next segment instead of failing completely
        continue;
      }
    }
    
    if (audioClips.length === 0) {
      throw new Error(`No audio clips were successfully generated for ${subtopicTitle}`);
    }
    
    this.logger.log(`Successfully generated ${audioClips.length}/${segments.length} audio clips for ${subtopicTitle}`);

    const finalAudioFile = await this.combineAudioClips(
      audioClips,
      audioDir,
      subtopicTitle
    );
    return finalAudioFile;
  }

  private async combineAudioClips(
    clips: { timestamp: number; file: string; duration: number }[],
    audioDir: string,
    subtopicTitle: string
  ): Promise<string> {
    const outputFile = path.join(
      audioDir,
      `${subtopicTitle.replace(/[^a-zA-Z0-9]/g, "_")}.mp3`
    );

    // If no clips, return empty file
    if (clips.length === 0) {
      this.logger.warn(`No audio clips to combine for ${subtopicTitle}`);
      await fs.writeFile(outputFile, Buffer.alloc(0));
      return outputFile;
    }

    // If only one clip, just copy it
    if (clips.length === 1) {
      this.logger.log(`Only one audio clip for ${subtopicTitle}, copying directly`);
      await fs.copy(clips[0].file, outputFile);
      return outputFile;
    }

    // Create FFmpeg command to combine clips with proper timing and normalize loudness
    // Ensure clips are sorted and use milliseconds for adelay (no 's' suffix)
    const sortedClips = [...clips].sort((a, b) => a.timestamp - b.timestamp);
    let filterComplex = "";
    let inputs = "";

    sortedClips.forEach((clip, index) => {
      inputs += `-i "${clip.file}" `;
      const delayMs = Math.max(0, Math.round(clip.timestamp * 1000));
      const inputRef = `[${index}:a]`;
      filterComplex += `${inputRef}adelay=${delayMs}:all=1[a${index}];`;
    });

    // Combine all delayed audio streams, then loudness-normalize to consistent level
    const inputRefs = sortedClips.map((_, index) => `[a${index}]`).join("");
    filterComplex += `${inputRefs}amix=inputs=${sortedClips.length}:duration=longest:dropout_transition=0[amixed];`;
    filterComplex += `[amixed]loudnorm=I=-16:TP=-1.5:LRA=11[out]`;

    const command = `ffmpeg ${inputs} -filter_complex "${filterComplex}" -map "[out]" "${outputFile}"`;

    try {
      this.logger.log(`Combining ${sortedClips.length} audio clips for ${subtopicTitle}`);
      
      // Add timeout to prevent hanging (5 minutes max)
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('FFmpeg audio combination timeout after 5 minutes')), 300000);
      });
      
      const execPromise = execAsync(command, { 
        maxBuffer: 128 * 1024 * 1024,
        timeout: 300000, // 5 minutes
        killSignal: 'SIGTERM'
      });

      const result = await Promise.race([execPromise, timeoutPromise]) as any;
      
      // Log FFmpeg output for debugging
      if (result.stdout) {
        this.logger.debug(`FFmpeg stdout: ${result.stdout}`);
      }
      if (result.stderr) {
        this.logger.debug(`FFmpeg stderr: ${result.stderr}`);
      }
      
      this.logger.log(`Successfully combined audio clips for ${subtopicTitle}`);
      return outputFile;
    } catch (error) {
      this.logger.error("Failed to combine audio clips:", error);
      this.logger.error(`FFmpeg command: ${command}`);
      
      // Try fallback: simple concatenation without complex filters
      this.logger.warn("Trying fallback audio combination method...");
      try {
        return await this.fallbackAudioCombination(sortedClips, outputFile, subtopicTitle);
      } catch (fallbackError) {
        this.logger.error("Fallback audio combination also failed:", fallbackError);
        throw error; // Throw original error
      }
    }
  }

  /**
   * Fallback method for combining audio clips using simple concatenation
   */
  private async fallbackAudioCombination(
    clips: { timestamp: number; file: string; duration: number }[],
    outputFile: string,
    subtopicTitle: string
  ): Promise<string> {
    this.logger.log(`Using fallback audio combination for ${subtopicTitle}`);
    
    // Create a simple file list for concatenation
    const tempListFile = path.join(path.dirname(outputFile), `temp_list_${Date.now()}.txt`);
    const fileListContent = clips.map(clip => `file '${clip.file}'`).join('\n');
    await fs.writeFile(tempListFile, fileListContent);
    
    try {
      // Use simple concat demuxer
      const fallbackCommand = `ffmpeg -f concat -safe 0 -i "${tempListFile}" -c copy "${outputFile}"`;
      
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Fallback FFmpeg timeout after 2 minutes')), 120000);
      });
      
      const execPromise = execAsync(fallbackCommand, { 
        maxBuffer: 64 * 1024 * 1024,
        timeout: 120000, // 2 minutes
        killSignal: 'SIGTERM'
      });

      await Promise.race([execPromise, timeoutPromise]);
      
      this.logger.log(`Fallback audio combination successful for ${subtopicTitle}`);
      return outputFile;
    } finally {
      // Clean up temp file
      try {
        await fs.remove(tempListFile);
      } catch (cleanupError) {
        this.logger.warn("Failed to cleanup temp list file:", cleanupError);
      }
    }
  }

  private countSlidesInMarkdown(markdownContent: string): number {
    // Count slides by looking for slide separators (---) or page breaks
    const slideSeparators = (markdownContent.match(/^---$/gm) || []).length;
    const pageBreaks = (markdownContent.match(/^\\pagebreak$/gm) || []).length;
    
    // If no explicit separators, count by headers (h1, h2) as slide indicators
    const headers = (markdownContent.match(/^#+\s+/gm) || []).length;
    
    // Return at least 1 slide, or the count of separators + 1
    const slideCount = Math.max(1, slideSeparators + pageBreaks + (headers > 0 ? headers : 1));
    
    this.logger.debug(`Counted ${slideCount} slides in markdown (separators: ${slideSeparators}, pagebreaks: ${pageBreaks}, headers: ${headers})`);
    return slideCount;
  }


  private async convertMarkdownToImages(
    markdownPath: string,
    baseDir: string,
    sectionTitle: string,
    subtopicTitle: string
  ): Promise<string> {
    const imagesDir = path.join(
      baseDir,
      "images",
      sectionTitle,
      subtopicTitle.replace(/[^a-zA-Z0-9]/g, "_")
    );
    await fs.ensureDir(imagesDir);

    // Check if markdown file exists
    if (!(await fs.pathExists(markdownPath))) {
      throw new Error(`Markdown file not found: ${markdownPath}`);
    }

    // Use exact Marp CLI pattern with explicit PNG output path (files will be created with suffixes)
    const outputPngBase = path.join(imagesDir, "slides.png");
    
    // Use the exact same command that works in CLI - no Chrome flags at all
    const simpleCommand = `marp "${markdownPath}" --images png -o "${outputPngBase}" --image-scale 1 --timeout 120000 --allow-local-files --html --no-stdin`;

    try {
      this.logger.debug(`Running simplified Marp command: ${simpleCommand}`);
      
      // Add timeout at Node.js level (2.5 minutes)
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Marp CLI execution timeout after 150 seconds')), 150000);
      });
      
      const execPromise = execAsync(simpleCommand, { 
        maxBuffer: 128 * 1024 * 1024,
        timeout: 150000, // 2.5 minutes
        killSignal: 'SIGTERM'
        // No custom environment variables - use system defaults
      });

      const result = await Promise.race([execPromise, timeoutPromise]) as any;
      
      // Log the result for debugging
      if (result.stdout) {
        this.logger.debug(`Marp stdout: ${result.stdout}`);
      }
      if (result.stderr) {
        this.logger.debug(`Marp stderr: ${result.stderr}`);
      }
      
      this.logger.debug(`Marp CLI completed, checking output directory: ${imagesDir}`);

      // Verify images were generated
      const files = await fs.readdir(imagesDir);
      const pngFiles = files.filter((f) => f.endsWith(".png"));

      if (pngFiles.length === 0) {
        throw new Error(`No PNG images generated in ${imagesDir}`);
      }

      this.logger.debug(`Generated ${pngFiles.length} images in ${imagesDir}`);
      return imagesDir;
    } catch (error) {
      this.logger.error("Failed to convert markdown to images:", error);
      this.logger.error(`Command was: marp "${markdownPath}" --images png -o "${outputPngBase}" --image-scale 1 --timeout 120000 --allow-local-files --html`);
      this.logger.error(`Markdown file: ${markdownPath}`);
      this.logger.error(`Output dir: ${imagesDir}`);
      
      // Log additional debugging info
      if (error.stderr) {
        this.logger.error(`stderr: ${error.stderr}`);
      }
      if (error.stdout) {
        this.logger.error(`stdout: ${error.stdout}`);
      }
      
      // Try one more time with the exact working CLI command
      this.logger.warn("Trying fallback with working CLI command...");
      try {
        const fallbackCommand = `marp "${markdownPath}" --images png -o "${outputPngBase}" --image-scale 1 --timeout 120000 --allow-local-files --html --no-stdin -- --no-sandbox --disable-setuid-sandbox --disable-dev-shm-usage --disable-gpu --single-process --disable-web-security --disable-features=VizDisplayCompositor --memory-pressure-off --disable-background-timer-throttling --disable-backgrounding-occluded-windows --disable-renderer-backgrounding --disable-extensions --disable-plugins --disable-images --disable-javascript --disable-background-networking --disable-default-apps --disable-sync --disable-translate --hide-scrollbars --metrics-recording-only --mute-audio --no-first-run --safebrowsing-disable-auto-update --disable-ipc-flooding-protection`;
        
        this.logger.debug(`Running fallback Marp command: ${fallbackCommand}`);
        
        const fallbackResult = await execAsync(fallbackCommand, { 
          maxBuffer: 128 * 1024 * 1024,
          timeout: 150000,
          killSignal: 'SIGTERM'
        });
        
        this.logger.log("Fallback Marp command succeeded!");
        if (fallbackResult.stdout) {
          this.logger.debug(`Fallback stdout: ${fallbackResult.stdout}`);
        }
        if (fallbackResult.stderr) {
          this.logger.debug(`Fallback stderr: ${fallbackResult.stderr}`);
        }
        
        // Check if images were generated
        const files = await fs.readdir(imagesDir);
        const pngFiles = files.filter((f) => f.endsWith(".png"));
        if (pngFiles.length > 0) {
          this.logger.log(`Fallback generated ${pngFiles.length} images successfully`);
          return imagesDir;
        }
      } catch (fallbackError) {
        this.logger.error("Fallback Marp command also failed:", fallbackError);
      }
      
      // Create a fallback placeholder image directory
      this.logger.warn("Creating fallback placeholder for failed image generation");
      await fs.ensureDir(imagesDir);
      
      // Try to create multiple placeholder images using available tools
      try {
        // Read the markdown file to determine how many slides we need
        const markdownContent = await fs.readFile(markdownPath, 'utf8');
        const slideCount = this.countSlidesInMarkdown(markdownContent);
        
        this.logger.debug(`Creating ${slideCount} placeholder images for failed Marp generation`);
        
        // First try ImageMagick if available
        try {
          for (let i = 1; i <= slideCount; i++) {
            const placeholderImage = path.join(imagesDir, `slides_${i.toString().padStart(3, '0')}.png`);
            const slideTitle = i === 1 ? `${sectionTitle} - ${subtopicTitle}` : `Slide ${i}`;
            
            const placeholderCommand = `convert -size 1920x1080 xc:white -gravity center -pointsize 48 -fill black -annotate +0+0 "Slide ${i}\\n${slideTitle}\\n\\nContent generation in progress..." "${placeholderImage}"`;
            this.logger.debug(`Creating placeholder image ${i} with ImageMagick: ${placeholderCommand}`);
            await execAsync(placeholderCommand, { timeout: 10000 });
            this.logger.debug(`Created placeholder image: ${placeholderImage}`);
          }
        } catch (imagemagickError) {
          // If ImageMagick fails, try using Node.js canvas or create a simple HTML to PNG
          this.logger.debug("ImageMagick not available, trying alternative method");
          
          // Create a simple HTML file and convert it to PNG using Marp
          const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {
      margin: 0;
      padding: 0;
      width: 1920px;
      height: 1080px;
      background: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: Arial, sans-serif;
      text-align: center;
    }
    .content {
      font-size: 48px;
      color: black;
      line-height: 1.2;
    }
  </style>
</head>
<body>
  <div class="content">
    Slide 1<br>
    ${sectionTitle}<br>
    ${subtopicTitle}<br><br>
    Content generation in progress...
  </div>
</body>
</html>`;
          
          const htmlFile = path.join(imagesDir, "placeholder.html");
          await fs.writeFile(htmlFile, htmlContent);
          
          // Try to convert HTML to PNG using Marp or similar
          const htmlToPngCommand = `marp "${htmlFile}" --images png -o "${path.join(imagesDir, 'slides.png')}" --image-scale 1 --timeout 30000 --allow-local-files --html`;
          
          try {
            await execAsync(htmlToPngCommand, { 
              timeout: 30000,
              env: {
                ...process.env,
                PUPPETEER_SKIP_CHROMIUM_DOWNLOAD: 'true'
              }
            });
            this.logger.debug(`Created placeholder images via HTML conversion`);
          } catch (htmlError) {
            throw new Error(`Both ImageMagick and HTML conversion failed: ${imagemagickError.message}, ${htmlError.message}`);
          }
        }
      } catch (placeholderError) {
        this.logger.warn("Failed to create placeholder images, using text file instead:", placeholderError);
        
        // Create a simple text file as last resort
        const placeholderFile = path.join(imagesDir, "slides_placeholder.txt");
        await fs.writeFile(placeholderFile, `Image generation failed for: ${sectionTitle} - ${subtopicTitle}\nMarkdown file: ${markdownPath}\nError: ${error.message}\n\nThis is a placeholder for the slides that should have been generated.`);
        
        this.logger.warn(`Created placeholder file: ${placeholderFile}`);
      }
      
      return imagesDir;
    }
  }

  private async compileVideoWithFFmpeg(
    audioPath: string,
    baseDir: string,
    sectionTitle: string,
    subtopicTitle: string
  ): Promise<string> {
    const videosDir = path.join(baseDir, "videos", sectionTitle);
    await fs.ensureDir(videosDir);

    const imagesDir = path.join(
      baseDir,
      "images",
      sectionTitle,
      subtopicTitle.replace(/[^a-zA-Z0-9]/g, "_")
    );
    const outputVideo = path.join(
      videosDir,
      `${subtopicTitle.replace(/[^a-zA-Z0-9]/g, "_")}.mp4`
    );

    // Check if images directory exists and has PNG files
    if (!(await fs.pathExists(imagesDir))) {
      throw new Error(`Images directory not found: ${imagesDir}`);
    }

    const imageFiles = await fs.readdir(imagesDir);
    const pngFiles = imageFiles.filter(f => f.endsWith('.png')).sort();
    
    if (pngFiles.length === 0) {
      throw new Error(`No PNG images found in ${imagesDir}`);
    }

    // Read transcript to get timing information
    const transcriptFile = path.join(
      baseDir,
      "transcripts",
      sectionTitle,
      `${subtopicTitle.replace(/[^a-zA-Z0-9]/g, "_")}.txt`
    );

    let slideTimings: number[] = [];
    if (await fs.pathExists(transcriptFile)) {
      slideTimings = await this.calculateSlideTimings(transcriptFile, pngFiles.length);
    } else {
      // Fallback: distribute slides evenly across audio duration
      slideTimings = await this.calculateEvenSlideTimings(audioPath, pngFiles.length);
    }

    const totalSlideDuration = slideTimings.reduce((sum, timing) => sum + timing, 0);
    this.logger.log(`Using ${pngFiles.length} slides with timings: ${slideTimings.join(', ')} seconds`);
    this.logger.log(`Total slide duration: ${totalSlideDuration} seconds`);

    // Create video with proper slide timing synchronization
    const command = await this.buildFFmpegCommandWithTiming(
      imagesDir,
      pngFiles,
      audioPath,
      outputVideo,
      slideTimings
    );

    try {
      this.logger.log(`Compiling video with timing sync: ${command}`);
      await execAsync(command, { maxBuffer: 128 * 1024 * 1024 });
      
      // Clean up temporary file list
      const tempListFile = path.join(imagesDir, 'filelist.txt');
      try {
        await fs.remove(tempListFile);
      } catch (cleanupError) {
        this.logger.warn("Failed to cleanup temp file list:", cleanupError);
      }
      
      this.logger.log(`Video compiled successfully: ${outputVideo}`);
      return outputVideo;
    } catch (error) {
      this.logger.error("Failed to compile video:", error);
      this.logger.error(`FFmpeg command: ${command}`);
      this.logger.error(`Images directory: ${imagesDir}`);
      this.logger.error(`Audio file: ${audioPath}`);
      
      // Clean up temporary file list on error
      const tempListFile = path.join(imagesDir, 'filelist.txt');
      try {
        await fs.remove(tempListFile);
      } catch (cleanupError) {
        this.logger.warn("Failed to cleanup temp file list:", cleanupError);
      }
      
      throw error;
    }
  }

  private async calculateSlideTimings(transcriptFile: string, slideCount: number): Promise<number[]> {
    try {
      const transcriptContent = await fs.readFile(transcriptFile, "utf8");
      const lines = transcriptContent.split("\n");
      
      // Extract timing information from transcript with content
      const transcriptSegments: { start: number; end: number; content: string }[] = [];
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        // Look for timestamp format [MM:SS] or [HH:MM:SS]
        const timestampMatch = line.match(/^\[(\d{1,2}):(\d{2})(?::(\d{2}))?\]\s*(.+)$/);
        if (timestampMatch) {
          const [, minutes, seconds, hours, content] = timestampMatch;
          const totalSeconds = hours ? 
            (parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseInt(seconds)) :
            (parseInt(minutes) * 60 + parseInt(seconds));
          
          // Find the next timestamp to determine end time
          let endTime = totalSeconds + 15; // Default 15 seconds if no next timestamp
          for (let j = i + 1; j < lines.length; j++) {
            const nextLine = lines[j].trim();
            const nextTimestampMatch = nextLine.match(/^\[(\d{1,2}):(\d{2})(?::(\d{2}))?\]/);
            if (nextTimestampMatch) {
              const [, nextMinutes, nextSeconds, nextHours] = nextTimestampMatch;
              endTime = nextHours ? 
                (parseInt(nextHours) * 3600 + parseInt(nextMinutes) * 60 + parseInt(nextSeconds)) :
                (parseInt(nextMinutes) * 60 + parseInt(nextSeconds));
              break;
            }
          }
          
          transcriptSegments.push({
            start: totalSeconds,
            end: endTime,
            content: content.trim()
          });
        }
      }
      
      if (transcriptSegments.length > 0) {
        // Map slides to transcript segments based on content similarity
        const slideTimings = await this.mapSlidesToTranscriptSegments(transcriptSegments, slideCount);
        this.logger.log(`Calculated slide timings from transcript segments: ${slideTimings.join(', ')} seconds`);
        return slideTimings;
      }
    } catch (error) {
      this.logger.warn("Failed to parse transcript timing, using fallback:", error);
    }
    
    // Fallback: equal distribution
    return this.calculateEvenSlideTimings("", slideCount);
  }

  private async mapSlidesToTranscriptSegments(
    transcriptSegments: { start: number; end: number; content: string }[],
    slideCount: number
  ): Promise<number[]> {
    // Define slide themes based on typical presentation structure
    const slideThemes = [
      { keywords: ['welcome', 'exploration', 'fascinating', 'introduction'], name: 'Title/Introduction' },
      { keywords: ['recap', 'previous', 'covered', 'session'], name: 'Previously Covered' },
      { keywords: ['deep dive', 'categories', 'eastern', 'western', 'dragons'], name: 'Deep Dive' },
      { keywords: ['best practices', 'pitfalls', 'mistakes', 'avoid'], name: 'Best Practices' },
      { keywords: ['coming up', 'next', 'preview', 'topics'], name: 'Coming Up Next' },
      { keywords: ['practice', 'exercises', 'assignment', 'writing'], name: 'Practice Exercises' }
    ];

    const slideTimings: number[] = [];
    
    // Group transcript segments by slide themes
    for (let slideIndex = 0; slideIndex < slideCount; slideIndex++) {
      const theme = slideThemes[slideIndex] || slideThemes[slideThemes.length - 1];
      
      // Find segments that match this slide's theme
      const matchingSegments = transcriptSegments.filter(segment => {
        const content = segment.content.toLowerCase();
        return theme.keywords.some(keyword => content.includes(keyword));
      });
      
      if (matchingSegments.length > 0) {
        // Calculate duration for this slide based on matching segments
        const totalDuration = matchingSegments.reduce((sum, segment) => {
          return sum + (segment.end - segment.start);
        }, 0);
        
        slideTimings.push(Math.max(totalDuration, 10)); // Minimum 10 seconds per slide
        this.logger.log(`Slide ${slideIndex + 1} (${theme.name}): ${Math.max(totalDuration, 10)}s based on ${matchingSegments.length} segments`);
      } else {
        // Fallback: distribute remaining time evenly
        const remainingSegments = transcriptSegments.filter(segment => {
          const content = segment.content.toLowerCase();
          return !slideThemes.some(theme => theme.keywords.some(keyword => content.includes(keyword)));
        });
        
        const fallbackDuration = remainingSegments.length > 0 ? 
          remainingSegments.reduce((sum, segment) => sum + (segment.end - segment.start), 0) / (slideCount - slideIndex) :
          15; // Default 15 seconds
        
        slideTimings.push(Math.max(fallbackDuration, 10));
        this.logger.log(`Slide ${slideIndex + 1} (${theme.name}): ${Math.max(fallbackDuration, 10)}s (fallback)`);
      }
    }
    
    // Ensure total duration matches transcript duration
    const totalTranscriptDuration = transcriptSegments.length > 0 ? 
      transcriptSegments[transcriptSegments.length - 1].end : 0;
    const currentTotal = slideTimings.reduce((sum, timing) => sum + timing, 0);
    
    if (totalTranscriptDuration > 0 && currentTotal !== totalTranscriptDuration) {
      // Scale timings to match transcript duration
      const scaleFactor = totalTranscriptDuration / currentTotal;
      for (let i = 0; i < slideTimings.length; i++) {
        slideTimings[i] = Math.round(slideTimings[i] * scaleFactor);
      }
      this.logger.log(`Scaled slide timings to match transcript duration: ${totalTranscriptDuration}s`);
    }
    
    return slideTimings;
  }

  private async calculateEvenSlideTimings(audioPath: string, slideCount: number): Promise<number[]> {
    try {
      // Get audio duration using ffprobe
      const probeCommand = `ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${audioPath}"`;
      const result = await execAsync(probeCommand);
      const duration = parseFloat(result.stdout.trim());
      
      if (duration > 0) {
        const slideDuration = duration / slideCount;
        const timings = new Array(slideCount).fill(slideDuration);
        this.logger.log(`Calculated even slide timings: ${timings.join(', ')} seconds (total audio: ${duration}s)`);
        return timings;
      }
    } catch (error) {
      this.logger.warn("Failed to get audio duration, using default timing:", error);
    }
    
    // Ultimate fallback: 10 seconds per slide
    const defaultTiming = 10;
    const timings = new Array(slideCount).fill(defaultTiming);
    this.logger.log(`Using default slide timings: ${timings.join(', ')} seconds`);
    return timings;
  }

  private async buildFFmpegCommandWithTiming(
    imagesDir: string,
    pngFiles: string[],
    audioPath: string,
    outputVideo: string,
    slideTimings: number[]
  ): Promise<string> {
    // Create a temporary file list for FFmpeg with proper timing
    const tempListFile = path.join(imagesDir, 'filelist.txt');
    const fileListContent = pngFiles.map((file, index) => {
      const duration = slideTimings[index];
      return `file '${path.join(imagesDir, file)}'\nduration ${duration}`;
    }).join('\n');
    
    // Add the last file again to ensure proper concatenation
    const lastFile = pngFiles[pngFiles.length - 1];
    const lastDuration = slideTimings[slideTimings.length - 1];
    const finalContent = fileListContent + `\nfile '${path.join(imagesDir, lastFile)}'`;
    
    await fs.writeFile(tempListFile, finalContent);
    
    // Use concat demuxer with proper timing - ensure video matches audio duration
    const command = [
      "ffmpeg",
      "-f", "concat",
      "-safe", "0",
      "-i", `"${tempListFile}"`,
      "-i", `"${audioPath}"`,
      "-c:v", "libx264",
      "-c:a", "aac",
      "-pix_fmt", "yuv420p",
      "-r", "30", // Set frame rate
      "-map", "0:v", // Map video from first input (images)
      "-map", "1:a", // Map audio from second input (audio file)
      "-shortest", // End when shortest stream ends (should be audio)
      "-y", // Overwrite output file
      `"${outputVideo}"`
    ].join(" ");
    
    return command;
  }

  private async cleanupLocalFiles(baseDir: string): Promise<void> {
    try {
      await fs.remove(baseDir);
      this.logger.log(`Cleaned up temporary files at: ${baseDir}`);
    } catch (error) {
      this.logger.error("Failed to cleanup local files:", error);
    }
  }

  // Utility methods

  private getSubtopicContext(
    sections: any[],
    sectionIndex: number,
    subtopicIndex: number
  ): { prevSummary: string; nextSummary: string } {
    let prevSummary = "";
    let nextSummary = "";

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
        prevSummary = `Previous section "${prevSection.title}" covered: ${
          prevSubtopics[prevSubtopics.length - 1].title
        }`;
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
    return sections.reduce(
      (total, section) => total + (section.subtopics?.length || 0),
      0
    );
  }

  private getTotalSteps(sections: any[]): number {
    const totalSubtopics = this.getTotalSubtopics(sections);
    return totalSubtopics * 7; // 7 steps per subtopic
  }

  private async calculateEstimatedTime(roadmapData: any): Promise<number> {
    const totalSubtopics = Object.values(roadmapData).reduce(
      (sum: number, subtopics: any) => sum + (subtopics?.length || 0),
      0
    );
    return Number(totalSubtopics) * 8; // 8 minutes per subtopic
  }

  private calculateRemainingTime(currentProgress: number): number {
    const remainingPercentage = 100 - currentProgress;
    return Math.ceil((remainingPercentage / 100) * 60); // Rough estimate in minutes
  }

  private async updateProgress(
    progressId: string,
    updates: Partial<CourseGenerationProgress>
  ): Promise<void> {
    if (!progressId) {
      // Session-first flow: no DB progress record yet; skip DB update
      return;
    }
    try {
      await this.progressRepository.update(progressId, updates);
    } catch (error) {
      this.logger.error(`Failed to update progress ${progressId}:`, error);
    }
  }

  private emitProgress(
    courseId: string,
    sessionId: string,
    progressData: ProgressUpdate
  ): void {
    try {
      if (courseId) {
        this.websocketGateway.emitProgressUpdate(courseId, progressData);
      } else if (sessionId) {
        this.websocketGateway.emitToSession(
          sessionId,
          "content_generation_progress",
          progressData
        );
      }
    } catch (error) {
      this.logger.error("Failed to emit progress:", error);
    }
  }

  @OnWorkerEvent("completed")
  onCompleted({ jobId }: { jobId: string }) {
    this.logger.log(`Content generation job completed: ${jobId}`);
  }

  @OnWorkerEvent("failed")
  onFailed({ jobId, failedReason }: { jobId: string; failedReason: string }) {
    this.logger.error(
      `Content generation job failed: ${jobId}, reason: ${failedReason}`
    );
  }

  /**
   * Build final payload with all generated content
   */
  private async buildFinalPayload(
    sections: any[],
    courseId: string | null,
    sessionId: string | null,
    roadmapData: any
  ): Promise<any> {
    try {
      const payload: any = {
        roadmap: roadmapData,
        sections: [],
        quizzes: [],
        flashcards: [],
        videos: [],
        courseDetails: null,
        generationSummary: {
          totalSections: sections.length,
          totalSubtopics: this.getTotalSubtopics(sections),
          totalVideos: 0,
          totalQuizzes: 0,
          totalFlashcards: 0,
          sessionId: sessionId,
          generatedAt: new Date().toISOString()
        }
      };

      if (!courseId) {
        this.logger.warn("No courseId provided for final payload");
        return payload;
      }

      // Get course details
      const course = await this.courseRepository.findOne({ where: { id: courseId } });
      if (course) {
        payload.courseDetails = {
          id: course.id,
          title: course.title,
          tutor_user_id: course.tutor_user_id,
          price_inr: course.price_inr,
          created_at: course.created_at
        };
      }

      // Get all sections from database
      const dbSections = await this.sectionRepository.find({
        where: { course_id: courseId },
        order: { index: 'ASC' }
      });

      // Get all subtopics from database
      const dbSubtopics = await this.subtopicRepository.find({
        where: { section_id: In(dbSections.map(s => s.id)) },
        order: { index: 'ASC' }
      });

      // Get all quizzes from database
      const dbQuizzes = await this.quizRepository.find({
        where: { course_id: courseId },
        relations: ['questions']
      });

      // Get all flashcards from database
      const dbFlashcards = await this.flashcardRepository.find({
        where: { course_id: courseId }
      });

      // Build sections with database data
      for (const dbSection of dbSections) {
        const sectionData: any = {
          id: dbSection.id,
          title: dbSection.title,
          index: dbSection.index,
          subtopics: []
        };

        // Get subtopics for this section
        const sectionSubtopics = dbSubtopics.filter(st => st.section_id === dbSection.id);
        
        for (const dbSubtopic of sectionSubtopics) {
          const subtopicData: any = {
            id: dbSubtopic.id,
            title: dbSubtopic.title,
            index: dbSubtopic.index,
            markdown_path: dbSubtopic.markdown_path,
            transcript_path: dbSubtopic.transcript_path,
            audio_path: dbSubtopic.audio_path,
            video_url: dbSubtopic.video_url,
            status: dbSubtopic.status
          };

          sectionData.subtopics.push(subtopicData);

          // Add video to videos array
          if (dbSubtopic.video_url) {
            payload.videos.push({
              id: dbSubtopic.id,
              title: dbSubtopic.title,
              url: dbSubtopic.video_url,
              section: dbSection.title,
              sectionIndex: dbSection.index,
              subtopicIndex: dbSubtopic.index
            });
            payload.generationSummary.totalVideos++;
          }
        }

        payload.sections.push(sectionData);
      }

      // Add quizzes
      for (const dbQuiz of dbQuizzes) {
        const quizData: any = {
          id: dbQuiz.id,
          title: dbQuiz.title,
          course_id: dbQuiz.course_id,
          section_id: dbQuiz.section_id,
          questions: dbQuiz.questions?.map(q => ({
            id: q.id,
            question: q.question,
            options: q.options,
            correct_index: q.correct_index,
            index: q.index
          })) || []
        };
        payload.quizzes.push(quizData);
        payload.generationSummary.totalQuizzes += quizData.questions.length;
      }

      // Add flashcards
      for (const dbFlashcard of dbFlashcards) {
        const flashcardData: any = {
          id: dbFlashcard.id,
          front: dbFlashcard.front,
          back: dbFlashcard.back,
          course_id: dbFlashcard.course_id,
          section_id: dbFlashcard.section_id,
          index: dbFlashcard.index
        };
        payload.flashcards.push(flashcardData);
        payload.generationSummary.totalFlashcards++;
      }

      this.logger.log(`Final payload built: ${payload.generationSummary.totalVideos} videos, ${payload.generationSummary.totalQuizzes} quiz questions, ${payload.generationSummary.totalFlashcards} flashcards`);

      return payload;
    } catch (error) {
      this.logger.error("Failed to build final payload:", error);
      return {
        roadmap: roadmapData,
        sections: [],
        quizzes: [],
        flashcards: [],
        videos: [],
        courseDetails: null,
        generationSummary: {
          totalSections: 0,
          totalSubtopics: 0,
          totalVideos: 0,
          totalQuizzes: 0,
          totalFlashcards: 0,
          sessionId: sessionId,
          generatedAt: new Date().toISOString(),
          error: "Failed to build complete payload"
        }
      };
    }
  }
}

