import { Processor, WorkerHost, OnWorkerEvent } from "@nestjs/bullmq";
import { Job } from "bullmq";
import { Logger, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
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
  CourseGenerationProgress,
  CourseSection,
  CourseSubtopic,
} from "../../courses/entities";
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
    private readonly subtopicRepository: Repository<CourseSubtopic>
  ) {
    super();
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>("OPENAI_API_KEY"),
    });
  }

  async process(job: Job<any, any, string>): Promise<any> {
    const { courseId, roadmapId, progressId, roadmapData, sessionId } =
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

    const tempKey = courseId
      ? String(courseId)
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

      // Get course sections and subtopics from database, or derive from roadmap
      let sections: any[] = [];
      if (courseId) {
        sections = await this.sectionRepository.find({
          where: { course_id: courseId },
          relations: ["subtopics"],
          order: { index: "ASC" },
        });
      } else {
        const entries = Object.entries(roadmapData || {});
        let idx = 0;
        sections = entries.map(([title, subs]: any) => ({
          id: `temp_${idx++}`,
          title,
          subtopics: (Array.isArray(subs) ? subs : []).map(
            (t: string, i: number) => ({ id: undefined, title: String(t) })
          ),
        }));
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
        status: "completed",
        current_step: "completed",
        progress_percentage: 100,
        completed_at: new Date(),
      });

      // Emit final completion payload with all generated content
      const finalPayload = await this.buildFinalPayload(
        sections,
        courseId,
        sessionId,
        roadmapData
      );

      this.emitProgress(courseId, sessionId, {
        progressPercentage: 100,
        currentTask: "Course generation completed successfully!",
        estimatedTimeRemaining: 0,
        finalPayload,
      });

      return {
        success: true,
        courseId,
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
    this.logger.log("Starting markdown file generation...");

    let currentProgress = startProgress;
    const sectionCount = sections.length;

    for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex++) {
      const section = sections[sectionIndex];
      const subtopics = section.subtopics || [];

      for (
        let subtopicIndex = 0;
        subtopicIndex < subtopics.length;
        subtopicIndex++
      ) {
        const subtopic = subtopics[subtopicIndex];

        // Calculate context summaries
        const { prevSummary, nextSummary } = this.getSubtopicContext(
          sections,
          sectionIndex,
          subtopicIndex
        );

        // Generate markdown content
        const markdownContent = await this.generateSubtopicMarkdown({
          sectionTitle: section.title,
          subtopicTitle: subtopic.title,
          roadmapJson: JSON.stringify(roadmapData),
          prevSummary,
          nextSummary,
        });

        // Save markdown file with Marp frontmatter
        const mdDir = path.join(baseDir, "markdown", section.title);
        await fs.ensureDir(mdDir);
        const mdFile = path.join(
          mdDir,
          `${subtopic.title.replace(/[^a-zA-Z0-9]/g, "_")}.md`
        );

        // Add Marp frontmatter to the markdown content
        const marpContent = `---
marp: true
theme: default
size: 1920x1080
paginate: true
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

    for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex++) {
      const section = sections[sectionIndex];
      const subtopics = section.subtopics || [];

      for (
        let subtopicIndex = 0;
        subtopicIndex < subtopics.length;
        subtopicIndex++
      ) {
        const subtopic = subtopics[subtopicIndex];

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

        // Read transcript - construct path if not set
        const transcriptFile =
          subtopic.transcript_path ||
          path.join(
            baseDir,
            "transcripts",
            section.title,
            `${subtopic.title.replace(/[^a-zA-Z0-9]/g, "_")}.txt`
          );
        const transcriptContent = await fs.readFile(transcriptFile, "utf8");

        // Generate audio with subtitle timing
        const audioFile = await this.generateSubtitleNarratedAudio(
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

        // Convert markdown to images using Marp CLI - construct path if not set
        const mdFile =
          subtopic.markdown_path ||
          path.join(
            baseDir,
            "markdown",
            section.title,
            `${subtopic.title.replace(/[^a-zA-Z0-9]/g, "_")}.md`
          );
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

    for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex++) {
      const section = sections[sectionIndex];
      const subtopics = section.subtopics || [];

      for (
        let subtopicIndex = 0;
        subtopicIndex < subtopics.length;
        subtopicIndex++
      ) {
        const subtopic = subtopics[subtopicIndex];

        // Find video file
        const videoFile = path.join(
          baseDir,
          "videos",
          section.title,
          `${subtopic.title.replace(/[^a-zA-Z0-9]/g, "_")}.mp4`
        );

        if (await fs.pathExists(videoFile)) {
          const videoBuffer = await fs.readFile(videoFile);
          const safeName = subtopic.title.replace(/[^a-zA-Z0-9]/g, "_");
          const objectKey = courseId
            ? `courses/${courseId}/videos/${section.title}/${safeName}.mp4`
            : `sessions/${sessionId}/videos/${section.title}/${safeName}.mp4`;

          await this.minioService.uploadFile(
            MINIO_BUCKETS.COURSES,
            objectKey,
            videoBuffer,
            "video/mp4"
          );

          if (courseId && subtopic.id) {
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
            const videoUrl = `${host}/${MINIO_BUCKETS.COURSES}/${objectKey}`;
            await this.subtopicRepository.update(subtopic.id, {
              video_url: videoUrl,
              status: "completed",
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
      "Return ONLY Markdown with proper slide breaks (---) between sections. No YAML frontmatter. No extra commentary.",
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
    for (const seg of segments) {
      const mp3Response = await this.openai.audio.speech.create({
        model: "tts-1",
        voice: "alloy",
        input: seg.text,
      });
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
    }

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
      await execAsync(command, { maxBuffer: 64 * 1024 * 1024 });
      return outputFile;
    } catch (error) {
      this.logger.error("Failed to combine audio clips:", error);
      throw error;
    }
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
    
    // Add Chromium args for Docker environment to prevent hanging
    const chromeArgs = '--no-sandbox --disable-setuid-sandbox --disable-dev-shm-usage --disable-gpu --single-process';
    const command = `marp "${markdownPath}" --images png -o "${outputPngBase}" --image-scale 2 --timeout 120000 --allow-local-files --html -- ${chromeArgs}`;

    try {
      this.logger.debug(`Running Marp CLI: ${command}`);
      this.logger.debug(`Working directory: ${process.cwd()}`);
      this.logger.debug(`Markdown path exists: ${await fs.pathExists(markdownPath)}`);
      this.logger.debug(`PUPPETEER_EXECUTABLE_PATH: ${process.env.PUPPETEER_EXECUTABLE_PATH || 'not set'}`);
      
      // Add timeout at Node.js level (2.5 minutes to give Marp time to timeout first)
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Marp CLI execution timeout after 150 seconds')), 150000);
      });

      const execPromise = execAsync(command, { 
        maxBuffer: 64 * 1024 * 1024,
        timeout: 150000, // 2.5 minutes
        killSignal: 'SIGTERM'
      });

      await Promise.race([execPromise, timeoutPromise]);
      
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
      this.logger.error(`Command was: ${command}`);
      this.logger.error(`Markdown file: ${markdownPath}`);
      this.logger.error(`Output dir: ${imagesDir}`);
      
      // Log additional debugging info
      if (error.stderr) {
        this.logger.error(`stderr: ${error.stderr}`);
      }
      if (error.stdout) {
        this.logger.error(`stdout: ${error.stdout}`);
      }
      
      throw error;
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

    // Create video from images and audio using glob pattern
    const command = [
      "ffmpeg",
      `-r 1/3`, // Show each image for 3 seconds
      `-pattern_type glob -i "${imagesDir}/*.png"`,
      `-i "${audioPath}"`,
      "-c:v libx264",
      "-c:a aac",
      "-shortest",
      "-pix_fmt yuv420p",
      `"${outputVideo}"`,
    ].join(" ");

    try {
      await execAsync(command);
      return outputVideo;
    } catch (error) {
      this.logger.error("Failed to compile video:", error);
      throw error;
    }
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
      };

      // Get course details if courseId exists
      if (courseId) {
        // This would need to be implemented based on your course entity structure
        payload.courseDetails = { id: courseId };
      }

      // Build section details with all generated content
      for (const section of sections) {
        const sectionData: any = {
          title: section.title,
          subtopics: [],
        };

        for (const subtopic of section.subtopics || []) {
          const subtopicData: any = {
            title: subtopic.title,
            markdownPath: subtopic.markdownPath,
            transcriptPath: subtopic.transcriptPath,
            audioPath: subtopic.audioPath,
            videoPath: subtopic.videoPath,
            slidesPath: subtopic.slidesPath,
          };

          // Add quizzes and flashcards for this subtopic
          if (subtopic.quizzes) {
            payload.quizzes.push(...subtopic.quizzes);
          }
          if (subtopic.flashcards) {
            payload.flashcards.push(...subtopic.flashcards);
          }

          sectionData.subtopics.push(subtopicData);
        }

        payload.sections.push(sectionData);
      }

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
        error: "Failed to build complete payload",
      };
    }
  }
}
