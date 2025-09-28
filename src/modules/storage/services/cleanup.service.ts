import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs-extra';
import * as path from 'path';

export interface CleanupManifest {
  courseId: string;
  generatedAt: string;
  completedAt: string;
  files: {
    markdown: string[];
    transcripts: string[];
    slides: string[];
    audio: string[];
    video: string[];
    uploaded: {
      minioUrl: string;
      localPath: string;
    }[];
  };
  stats: {
    totalFiles: number;
    totalSize: number;
    processingTime: number;
  };
  cleanedUp?: boolean;
  cleanedUpAt?: string;
  retainedFiles?: string[];
}

/**
 * Service for cleaning up local artifacts after successful content generation
 * Keeps README.md and manifest.json, removes heavy local files
 */
@Injectable()
export class CleanupService {
  private readonly logger = new Logger(CleanupService.name);
  private readonly generatedDir = path.join(process.cwd(), 'generated');

  /**
   * Clean up local artifacts for a completed course generation
   * Keeps README.md and manifest.json, removes heavy files
   */
  async cleanupCourseArtifacts(
    courseId: string,
    manifest: CleanupManifest,
  ): Promise<void> {
    const courseDir = path.join(this.generatedDir, courseId);
    
    if (!await fs.pathExists(courseDir)) {
      this.logger.warn(`Course directory not found: ${courseDir}`);
      return;
    }

    this.logger.log(`Starting cleanup for course: ${courseId}`);

    try {
      // Remove heavy local artifacts
      await this.removeHeavyArtifacts(courseDir, manifest);
      
      // Update manifest with cleanup info
      await this.updateManifestAfterCleanup(courseDir, manifest);
      
      this.logger.log(`Cleanup completed for course: ${courseId}`);
    } catch (error) {
      this.logger.error(`Cleanup failed for course ${courseId}:`, error);
      throw error;
    }
  }

  /**
   * Remove heavy local artifacts while keeping essential files
   */
  private async removeHeavyArtifacts(
    courseDir: string,
    manifest: CleanupManifest,
  ): Promise<void> {
    const sectionsDir = path.join(courseDir, 'sections');
    
    if (!await fs.pathExists(sectionsDir)) {
      this.logger.warn(`Sections directory not found: ${sectionsDir}`);
      return;
    }

    // Remove sections content (markdown, transcripts, slides, audio, local video)
    const sectionDirs = await fs.readdir(sectionsDir);
    
    for (const sectionDir of sectionDirs) {
      const fullSectionPath = path.join(sectionsDir, sectionDir);
      
      if (!(await fs.stat(fullSectionPath)).isDirectory()) {
        continue;
      }

      // Remove markdown files
      const markdownFiles = await this.findFiles(fullSectionPath, '*.md');
      for (const file of markdownFiles) {
        await fs.remove(file);
        this.logger.debug(`Removed markdown: ${file}`);
      }

      // Remove transcripts
      const transcriptDir = path.join(fullSectionPath, 'transcripts');
      if (await fs.pathExists(transcriptDir)) {
        await fs.remove(transcriptDir);
        this.logger.debug(`Removed transcripts: ${transcriptDir}`);
      }

      // Remove slides
      const slidesDir = path.join(fullSectionPath, 'slides');
      if (await fs.pathExists(slidesDir)) {
        await fs.remove(slidesDir);
        this.logger.debug(`Removed slides: ${slidesDir}`);
      }

      // Remove audio
      const audioDir = path.join(fullSectionPath, 'audio');
      if (await fs.pathExists(audioDir)) {
        await fs.remove(audioDir);
        this.logger.debug(`Removed audio: ${audioDir}`);
      }

      // Remove local video files
      const videoDir = path.join(fullSectionPath, 'video');
      if (await fs.pathExists(videoDir)) {
        await fs.remove(videoDir);
        this.logger.debug(`Removed local video: ${videoDir}`);
      }
    }

    // Remove assessments directory (keep only manifest info)
    const assessmentsDir = path.join(courseDir, 'assessments');
    if (await fs.pathExists(assessmentsDir)) {
      await fs.remove(assessmentsDir);
      this.logger.debug(`Removed assessments: ${assessmentsDir}`);
    }
  }

  /**
   * Update manifest with cleanup information
   */
  private async updateManifestAfterCleanup(
    courseDir: string,
    manifest: CleanupManifest,
  ): Promise<void> {
    const manifestPath = path.join(courseDir, 'manifest.json');
    
    const updatedManifest = {
      ...manifest,
      cleanedUp: true,
      cleanedUpAt: new Date().toISOString(),
      retainedFiles: [
        'README.md',
        'manifest.json',
      ],
    };

    await fs.writeJson(manifestPath, updatedManifest, { spaces: 2 });
    this.logger.debug(`Updated manifest: ${manifestPath}`);
  }

  /**
   * Create initial manifest for a course generation
   */
  async createManifest(
    courseId: string,
    initialData: Partial<CleanupManifest>,
  ): Promise<CleanupManifest> {
    const courseDir = path.join(this.generatedDir, courseId);
    await fs.ensureDir(courseDir);

    const manifest: CleanupManifest = {
      courseId,
      generatedAt: new Date().toISOString(),
      completedAt: '',
      files: {
        markdown: [],
        transcripts: [],
        slides: [],
        audio: [],
        video: [],
        uploaded: [],
      },
      stats: {
        totalFiles: 0,
        totalSize: 0,
        processingTime: 0,
      },
      ...initialData,
    };

    const manifestPath = path.join(courseDir, 'manifest.json');
    await fs.writeJson(manifestPath, manifest, { spaces: 2 });
    
    this.logger.log(`Created manifest for course: ${courseId}`);
    return manifest;
  }

  /**
   * Update manifest with file information
   */
  async updateManifest(
    courseId: string,
    updates: Partial<CleanupManifest>,
  ): Promise<void> {
    const manifestPath = path.join(this.generatedDir, courseId, 'manifest.json');
    
    if (!await fs.pathExists(manifestPath)) {
      this.logger.warn(`Manifest not found: ${manifestPath}`);
      return;
    }

    const currentManifest = await fs.readJson(manifestPath);
    const updatedManifest = { ...currentManifest, ...updates };
    
    await fs.writeJson(manifestPath, updatedManifest, { spaces: 2 });
    this.logger.debug(`Updated manifest for course: ${courseId}`);
  }

  /**
   * Get manifest for a course
   */
  async getManifest(courseId: string): Promise<CleanupManifest | null> {
    const manifestPath = path.join(this.generatedDir, courseId, 'manifest.json');
    
    if (!await fs.pathExists(manifestPath)) {
      return null;
    }

    return await fs.readJson(manifestPath);
  }

  /**
   * Clean up old completed courses (older than specified days)
   */
  async cleanupOldCourses(olderThanDays: number = 7): Promise<void> {
    if (!await fs.pathExists(this.generatedDir)) {
      return;
    }

    const courseDirs = await fs.readdir(this.generatedDir);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    for (const courseDir of courseDirs) {
      const fullPath = path.join(this.generatedDir, courseDir);
      
      if (!(await fs.stat(fullPath)).isDirectory()) {
        continue;
      }

      try {
        const manifest = await this.getManifest(courseDir);
        if (!manifest || !manifest.cleanedUp) {
          continue; // Skip incomplete or uncleaned courses
        }

        const completedDate = new Date(manifest.completedAt);
        if (completedDate < cutoffDate) {
          await fs.remove(fullPath);
          this.logger.log(`Removed old course directory: ${courseDir}`);
        }
      } catch (error) {
        this.logger.warn(`Failed to process course directory ${courseDir}:`, error);
      }
    }
  }

  /**
   * Get course generation statistics
   */
  async getCourseStats(courseId: string): Promise<{
    totalSize: number;
    fileCount: number;
    lastModified: Date;
  } | null> {
    const courseDir = path.join(this.generatedDir, courseId);
    
    if (!await fs.pathExists(courseDir)) {
      return null;
    }

    const stats = await fs.stat(courseDir);
    const files = await this.getAllFiles(courseDir);
    
    let totalSize = 0;
    for (const file of files) {
      const fileStats = await fs.stat(file);
      totalSize += fileStats.size;
    }

    return {
      totalSize,
      fileCount: files.length,
      lastModified: stats.mtime,
    };
  }

  /**
   * Helper: Find files matching pattern
   */
  private async findFiles(dir: string, pattern: string): Promise<string[]> {
    const files: string[] = [];
    
    if (!await fs.pathExists(dir)) {
      return files;
    }

    const items = await fs.readdir(dir);
    
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stats = await fs.stat(fullPath);
      
      if (stats.isDirectory()) {
        const subFiles = await this.findFiles(fullPath, pattern);
        files.push(...subFiles);
      } else if (this.matchesPattern(item, pattern)) {
        files.push(fullPath);
      }
    }
    
    return files;
  }

  /**
   * Helper: Get all files in directory recursively
   */
  private async getAllFiles(dir: string): Promise<string[]> {
    const files: string[] = [];
    
    if (!await fs.pathExists(dir)) {
      return files;
    }

    const items = await fs.readdir(dir);
    
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stats = await fs.stat(fullPath);
      
      if (stats.isDirectory()) {
        const subFiles = await this.getAllFiles(fullPath);
        files.push(...subFiles);
      } else {
        files.push(fullPath);
      }
    }
    
    return files;
  }

  /**
   * Helper: Check if filename matches pattern
   */
  private matchesPattern(filename: string, pattern: string): boolean {
    if (pattern === '*') return true;
    if (pattern.startsWith('*.')) {
      const ext = pattern.substring(1);
      return filename.endsWith(ext);
    }
    return filename === pattern;
  }
}
