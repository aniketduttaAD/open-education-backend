import { Injectable, Logger, BadRequestException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as fs from "fs-extra";
import * as path from "path";
import ffmpeg from "fluent-ffmpeg";
import { spawn } from "child_process";
import { exec } from "child_process";
import { promisify } from "util";
import { v4 as uuidv4 } from "uuid";
import { OpenAIService } from "./openai.service";

/**
 * Video generation service for AI-powered content creation
 * Implements: GPT-4 (content) → Marp CLI (slides) → TTS (audio) → FFmpeg (video)
 */
@Injectable()
export class VideoGenerationService {
  private readonly logger = new Logger(VideoGenerationService.name);
  private readonly tempDir: string;
  private readonly outputDir: string;
  private readonly marpCliPath: string;
  private readonly ffmpegPath: string;
  private readonly execAsync = promisify(exec);

  constructor(
    private configService: ConfigService,
    private openaiService: OpenAIService
  ) {
    this.tempDir = path.join(process.cwd(), "generated", "video-generation");
    this.outputDir = path.join(process.cwd(), "generated", "videos");
    this.marpCliPath = "marp";
    this.ffmpegPath = "ffmpeg";

    this.ensureDirectories();
  }

  /**
   * Generate complete video from course content
   */
  async generateVideo(content: {
    title: string;
    slides: string[];
    transcript: string;
    duration?: number;
  }): Promise<{
    videoPath: string;
    videoUrl: string;
    duration: number;
    slidesCount: number;
  }> {
    this.logger.log(`Starting video generation for: ${content.title}`);

    const sessionId = uuidv4();
    const sessionDir = path.join(this.tempDir, sessionId);

    try {
      await fs.ensureDir(sessionDir);

      // Step 1: Generate slides with Marp CLI
      const slidesPath = await this.generateSlides(content.slides, sessionDir);

      // Step 2: Generate audio with OpenAI TTS
      const audioPath = await this.generateAudio(
        content.transcript,
        sessionDir
      );

      // Step 3: Compile video with FFmpeg
      const videoPath = await this.compileVideo(
        slidesPath,
        audioPath,
        sessionDir,
        content.title
      );

      // Step 4: Move to final output directory
      const finalVideoPath = await this.moveToOutput(videoPath, content.title);

      // Cleanup temporary files
      await this.cleanup(sessionDir);

      const videoUrl = this.getVideoUrl(finalVideoPath);
      const duration = await this.getVideoDuration(finalVideoPath);

      this.logger.log(`Video generation completed: ${finalVideoPath}`);

      return {
        videoPath: finalVideoPath,
        videoUrl,
        duration,
        slidesCount: content.slides.length,
      };
    } catch (error) {
      this.logger.error(`Video generation failed:`, error);
      await this.cleanup(sessionDir);
      throw new BadRequestException("Failed to generate video");
    }
  }

  /**
   * Check if browser is available for Marp CLI
   */
  private async checkBrowserAvailability(): Promise<boolean> {
    try {
      const { spawn } = await import("child_process");
      return new Promise((resolve) => {
        const chromeProcess = spawn("which", ["chromium-browser"], {
          stdio: "ignore",
        });
        chromeProcess.on("close", (code) => {
          resolve(code === 0);
        });
        chromeProcess.on("error", () => {
          resolve(false);
        });
      });
    } catch (error) {
      this.logger.warn("Could not check browser availability:", error);
      return false;
    }
  }

  /**
   * Generate slides using Marp CLI
   */
  private async generateSlides(
    slides: string[],
    sessionDir: string
  ): Promise<string> {
    this.logger.log("Generating slides with Marp CLI");

    const markdownContent = this.createMarpMarkdown(slides);
    const markdownPath = path.join(sessionDir, "slides.md");
    const outputDir = path.join(sessionDir, "slides");

    await fs.writeFile(markdownPath, markdownContent);
    await fs.ensureDir(outputDir);
    const outputPngBase = path.join(outputDir, 'slides.png');
    
    // Add Chromium args for Docker environment to prevent hanging
    const chromeArgs = '--no-sandbox --disable-setuid-sandbox --disable-dev-shm-usage --disable-gpu --single-process';
    const command = `${this.marpCliPath} "${markdownPath}" --images png -o "${outputPngBase}" --image-scale 2 --timeout 120000 --allow-local-files --html -- ${chromeArgs}`;
    this.logger.log(`Running Marp CLI: ${command}`);
    this.logger.debug(`PUPPETEER_EXECUTABLE_PATH: ${process.env.PUPPETEER_EXECUTABLE_PATH || 'not set'}`);
    
    try {
      // Add timeout at Node.js level (2.5 minutes to give Marp time to timeout first)
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Marp CLI execution timeout after 150 seconds')), 150000);
      });

      const execPromise = this.execAsync(command, { 
        maxBuffer: 64 * 1024 * 1024,
        timeout: 150000, // 2.5 minutes
        killSignal: 'SIGTERM'
      });

      await Promise.race([execPromise, timeoutPromise]);
      
      // Verify images
      const files = await fs.readdir(outputDir);
      const pngs = files.filter((f) => f.endsWith(".png"));
      if (pngs.length === 0) {
        throw new Error(`No PNG images generated in ${outputDir}`);
      }
      this.logger.log(`Slides generated successfully: ${pngs.length} images`);
      return outputDir;
    } catch (error) {
      this.logger.error("Marp CLI failed:", error as any);
      if (error.stderr) {
        this.logger.error(`stderr: ${error.stderr}`);
      }
      if (error.stdout) {
        this.logger.error(`stdout: ${error.stdout}`);
      }
      throw error;
    }
  }

  /**
   * Generate audio using OpenAI TTS
   */
  private async generateAudio(
    transcript: string,
    sessionDir: string
  ): Promise<string> {
    this.logger.log("Generating audio with OpenAI TTS");

    const audioPath = path.join(sessionDir, "narration.mp3");

    try {
      // Use the injected OpenAI service
      await this.openaiService.generateTTSAndSave(transcript, audioPath);
      this.logger.log("Audio generated successfully");
      return audioPath;
    } catch (error) {
      this.logger.error("TTS generation failed:", error);
      throw error;
    }
  }

  /**
   * Compile video using FFmpeg
   */
  private async compileVideo(
    slidesDir: string,
    audioPath: string,
    sessionDir: string,
    title: string
  ): Promise<string> {
    this.logger.log("Compiling video with FFmpeg");

    const videoPath = path.join(
      sessionDir,
      `${title.replace(/[^a-zA-Z0-9]/g, "_")}.mp4`
    );

    return new Promise((resolve, reject) => {
      const command = ffmpeg()
        .setFfmpegPath(this.ffmpegPath)
        .input(slidesDir + "/*.png")
        .inputOptions(["-pattern_type", "glob"])
        .inputOptions(["-framerate", "1/5"]) // 5 seconds per slide
        .input(audioPath)
        .outputOptions([
          "-c:v",
          "libx264",
          "-c:a",
          "aac",
          "-shortest",
          "-pix_fmt",
          "yuv420p",
          "-movflags",
          "+faststart",
          "-filter:a",
          "loudnorm=I=-16:TP=-1.5:LRA=11",
        ])
        .output(videoPath);

      command.on("start", (commandLine: string) => {
        this.logger.log(`FFmpeg command: ${commandLine}`);
      });

      command.on("progress", (progress: any) => {
        this.logger.log(`FFmpeg progress: ${progress.percent}%`);
      });

      command.on("end", () => {
        this.logger.log("Video compilation completed");
        resolve(videoPath);
      });

      command.on("error", (error: Error) => {
        this.logger.error("FFmpeg compilation failed:", error);
        reject(error);
      });

      command.run();
    });
  }

  /**
   * Create Marp-compatible Markdown content
   */
  private createMarpMarkdown(slides: string[]): string {
    const header = `---
marp: true
theme: default
size: 1920x1080
paginate: true
---

`;

    const slideContent = slides
      .map((slide, index) => {
        return `# Slide ${index + 1}

${slide}

---
`;
      })
      .join("\n");

    return header + slideContent;
  }

  /**
   * Move video to final output directory
   */
  private async moveToOutput(
    videoPath: string,
    title: string
  ): Promise<string> {
    const fileName = `${title.replace(/[^a-zA-Z0-9]/g, "_")}_${Date.now()}.mp4`;
    const finalPath = path.join(this.outputDir, fileName);

    await fs.move(videoPath, finalPath);
    return finalPath;
  }

  /**
   * Get video duration in seconds
   */
  private async getVideoDuration(videoPath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) {
          reject(err);
        } else {
          resolve(metadata.format.duration || 0);
        }
      });
    });
  }

  /**
   * Get public URL for video
   */
  private getVideoUrl(videoPath: string): string {
    return videoPath;
  }

  /**
   * Ensure required directories exist
   */
  private async ensureDirectories(): Promise<void> {
    await fs.ensureDir(this.tempDir);
    await fs.ensureDir(this.outputDir);
  }

  /**
   * Cleanup temporary files
   */
  private async cleanup(sessionDir: string): Promise<void> {
    try {
      await fs.remove(sessionDir);
      this.logger.log("Temporary files cleaned up");
    } catch (error) {
      this.logger.warn("Failed to cleanup temporary files:", error);
    }
  }

  /**
   * Generate video from course topic content
   */
  async generateCourseVideo(topicContent: {
    title: string;
    content: string;
    learningObjectives: string[];
    keyPoints: string[];
  }): Promise<{
    videoPath: string;
    videoUrl: string;
    duration: number;
    slidesCount: number;
  }> {
    this.logger.log(`Generating course video for topic: ${topicContent.title}`);

    // Generate slides from content
    const slides = this.createSlidesFromContent(topicContent);

    // Generate transcript
    const transcript = this.createTranscriptFromContent(topicContent);

    return this.generateVideo({
      title: topicContent.title,
      slides,
      transcript,
    });
  }

  /**
   * Create slides from topic content
   */
  private createSlidesFromContent(topicContent: {
    title: string;
    content: string;
    learningObjectives: string[];
    keyPoints: string[];
  }): string[] {
    const slides: string[] = [];

    // Title slide
    slides.push(`# ${topicContent.title}\n\nWelcome to this learning module!`);

    // Learning objectives slide
    if (topicContent.learningObjectives.length > 0) {
      const objectives = topicContent.learningObjectives
        .map((obj, index) => `${index + 1}. ${obj}`)
        .join("\n");
      slides.push(`## Learning Objectives\n\n${objectives}`);
    }

    // Content slides (split by paragraphs)
    const paragraphs = topicContent.content.split("\n\n");
    paragraphs.forEach((paragraph, index) => {
      if (paragraph.trim()) {
        slides.push(`## Key Concept ${index + 1}\n\n${paragraph}`);
      }
    });

    // Key points slide
    if (topicContent.keyPoints.length > 0) {
      const points = topicContent.keyPoints
        .map((point, index) => `• ${point}`)
        .join("\n");
      slides.push(`## Key Takeaways\n\n${points}`);
    }

    // Summary slide
    slides.push(
      `## Summary\n\nThank you for completing this module!\n\nYou've learned about ${topicContent.title} and are ready to move forward.`
    );

    return slides;
  }

  /**
   * Create transcript from content
   */
  private createTranscriptFromContent(topicContent: {
    title: string;
    content: string;
    learningObjectives: string[];
    keyPoints: string[];
  }): string {
    let transcript = `Welcome to this learning module on ${topicContent.title}. `;

    if (topicContent.learningObjectives.length > 0) {
      transcript += `By the end of this module, you will be able to: `;
      transcript += topicContent.learningObjectives.join(", ") + ". ";
    }

    transcript += `Let's begin with the main content. `;
    transcript += topicContent.content.replace(/\n\n/g, " ");

    if (topicContent.keyPoints.length > 0) {
      transcript += ` Here are the key takeaways: `;
      transcript += topicContent.keyPoints.join(", ") + ". ";
    }

    transcript += `Thank you for completing this module on ${topicContent.title}. You've done great work!`;

    return transcript;
  }
}
