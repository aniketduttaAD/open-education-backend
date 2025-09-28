import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs-extra';
import * as path from 'path';

export interface CourseStructure {
  id: string;
  title: string;
  level: string;
  durationWeeks: number;
  weeklyCommitmentHours: number;
  sections: CourseSection[];
}

export interface CourseSection {
  index: number;
  title: string;
  subtopics: CourseSubtopic[];
}

export interface CourseSubtopic {
  index: number;
  title: string;
  markdownPath?: string;
  transcriptPath?: string;
  audioPath?: string;
  videoUrl?: string;
  slidesPath?: string;
}

/**
 * Service for managing the file structure under generated/<id>/
 * Creates proper directory structure, README.md, and manifest.json
 */
@Injectable()
export class FileStructureService {
  private readonly logger = new Logger(FileStructureService.name);
  private readonly generatedDir = path.join(process.cwd(), 'generated');

  /**
   * Create the complete file structure for a course
   */
  async createCourseStructure(courseData: CourseStructure): Promise<void> {
    const courseDir = path.join(this.generatedDir, courseData.id);
    
    this.logger.log(`Creating file structure for course: ${courseData.id}`);

    try {
      // Create main course directory
      await fs.ensureDir(courseDir);

      // Create sections directories
      for (const section of courseData.sections) {
        await this.createSectionStructure(courseDir, section);
      }

      // Create assessments directory
      await this.createAssessmentsStructure(courseDir, courseData.sections);

      // Generate README.md
      await this.generateReadme(courseDir, courseData);

      this.logger.log(`File structure created for course: ${courseData.id}`);
    } catch (error) {
      this.logger.error(`Failed to create file structure for course ${courseData.id}:`, error);
      throw error;
    }
  }

  /**
   * Create section directory structure
   */
  private async createSectionStructure(
    courseDir: string,
    section: CourseSection,
  ): Promise<void> {
    const sectionDirName = `${String(section.index).padStart(2, '0')}-${this.sanitizeFilename(section.title)}`;
    const sectionDir = path.join(courseDir, 'sections', sectionDirName);

    await fs.ensureDir(sectionDir);

    // Create subdirectories for each section
    await fs.ensureDir(path.join(sectionDir, 'transcripts'));
    await fs.ensureDir(path.join(sectionDir, 'slides'));
    await fs.ensureDir(path.join(sectionDir, 'audio'));
    await fs.ensureDir(path.join(sectionDir, 'video'));

    // Create markdown files for each subtopic
    for (const subtopic of section.subtopics) {
      const subtopicFileName = `${String(subtopic.index).padStart(2, '0')}-${this.sanitizeFilename(subtopic.title)}.md`;
      const subtopicPath = path.join(sectionDir, subtopicFileName);
      
      // Create placeholder markdown file
      await this.createPlaceholderMarkdown(subtopicPath, subtopic.title);
    }
  }

  /**
   * Create assessments directory structure
   */
  private async createAssessmentsStructure(
    courseDir: string,
    sections: CourseSection[],
  ): Promise<void> {
    const assessmentsDir = path.join(courseDir, 'assessments');
    await fs.ensureDir(assessmentsDir);

    const quizzesDir = path.join(assessmentsDir, 'quizzes');
    const flashcardsDir = path.join(assessmentsDir, 'flashcards');

    await fs.ensureDir(quizzesDir);
    await fs.ensureDir(flashcardsDir);

    // Create placeholder assessment files for each section
    for (const section of sections) {
      const sectionIndex = String(section.index).padStart(2, '0');
      const sectionName = this.sanitizeFilename(section.title);

      // Quiz placeholder
      const quizFile = path.join(quizzesDir, `${sectionIndex}-${sectionName}.json`);
      await this.createPlaceholderQuiz(quizFile, section);

      // Flashcards placeholder
      const flashcardFile = path.join(flashcardsDir, `${sectionIndex}-${sectionName}.json`);
      await this.createPlaceholderFlashcards(flashcardFile, section);
    }
  }

  /**
   * Generate README.md for the course
   */
  private async generateReadme(courseDir: string, courseData: CourseStructure): Promise<void> {
    const readmePath = path.join(courseDir, 'README.md');
    
    const readmeContent = this.buildReadmeContent(courseData);
    await fs.writeFile(readmePath, readmeContent, 'utf8');
    
    this.logger.debug(`Generated README.md for course: ${courseData.id}`);
  }

  /**
   * Build README content
   */
  private buildReadmeContent(courseData: CourseStructure): string {
    const totalHours = courseData.durationWeeks * courseData.weeklyCommitmentHours;
    
    let content = `# ${courseData.title}\n\n`;
    content += `**Level:** ${courseData.level}\n`;
    content += `**Duration:** ${courseData.durationWeeks} weeks (${courseData.weeklyCommitmentHours} hours/week)\n`;
    content += `**Total Commitment:** ${totalHours} hours\n\n`;
    content += `## Course Overview\n\n`;
    content += `This course provides comprehensive coverage of the topics outlined below. Each section builds upon previous knowledge and includes practical exercises and assessments.\n\n`;
    content += `## Table of Contents\n\n`;

    // Add table of contents
    for (const section of courseData.sections) {
      const sectionIndex = String(section.index).padStart(2, '0');
      const sectionDirName = `${sectionIndex}-${this.sanitizeFilename(section.title)}`;
      
      content += `### ${section.index}. ${section.title}\n`;
      content += `📁 [sections/${sectionDirName}/](./sections/${sectionDirName}/)\n\n`;
      
      for (const subtopic of section.subtopics) {
        const subtopicIndex = String(subtopic.index).padStart(2, '0');
        const subtopicFileName = `${subtopicIndex}-${this.sanitizeFilename(subtopic.title)}.md`;
        
        content += `   ${section.index}.${subtopic.index}. [${subtopic.title}](./sections/${sectionDirName}/${subtopicFileName})\n`;
      }
      content += '\n';
    }

    content += `## Assessments\n\n`;
    content += `- **Quizzes:** Located in [assessments/quizzes/](./assessments/quizzes/)\n`;
    content += `- **Flashcards:** Located in [assessments/flashcards/](./assessments/flashcards/)\n\n`;
    
    content += `## File Structure\n\n`;
    content += `\`\`\`\n`;
    content += `generated/${courseData.id}/\n`;
    content += `├── README.md                    # This file\n`;
    content += `├── manifest.json               # Generation metadata\n`;
    content += `└── sections/\n`;
    
    for (const section of courseData.sections) {
      const sectionIndex = String(section.index).padStart(2, '0');
      const sectionDirName = `${sectionIndex}-${this.sanitizeFilename(section.title)}`;
      
      content += `    └── ${sectionDirName}/\n`;
      content += `        ├── *.md                 # Lesson content\n`;
      content += `        ├── transcripts/         # Audio transcripts\n`;
      content += `        ├── slides/              # Presentation slides\n`;
      content += `        ├── audio/               # Audio files\n`;
      content += `        └── video/               # Video files\n`;
    }
    
    content += `└── assessments/\n`;
    content += `    ├── quizzes/                 # Quiz files\n`;
    content += `    └── flashcards/              # Flashcard files\n`;
    content += `\`\`\`\n\n`;
    
    content += `## Getting Started\n\n`;
    content += `1. Review the course structure above\n`;
    content += `2. Start with the first section and work through each subtopic sequentially\n`;
    content += `3. Complete the assessments after each section\n`;
    content += `4. Use the flashcards for spaced repetition learning\n\n`;
    
    content += `---\n`;
    content += `*Generated on ${new Date().toISOString()}*\n`;

    return content;
  }

  /**
   * Create placeholder markdown file
   */
  private async createPlaceholderMarkdown(filePath: string, title: string): Promise<void> {
    const content = `# ${title}

## Learning Objectives

- [ ] Objective 1
- [ ] Objective 2
- [ ] Objective 3

## Content

*Content will be generated here...*

## Practice Exercises

1. Exercise 1
2. Exercise 2
3. Exercise 3

## Next Steps

*Continue to the next subtopic...*
`;

    await fs.writeFile(filePath, content, 'utf8');
  }

  /**
   * Create placeholder quiz file
   */
  private async createPlaceholderQuiz(filePath: string, section: CourseSection): Promise<void> {
    const quizData = {
      section: section.title,
      sectionIndex: section.index,
      questions: [],
      createdAt: new Date().toISOString(),
      status: 'pending',
    };

    await fs.writeJson(filePath, quizData, { spaces: 2 });
  }

  /**
   * Create placeholder flashcards file
   */
  private async createPlaceholderFlashcards(filePath: string, section: CourseSection): Promise<void> {
    const flashcardData = {
      section: section.title,
      sectionIndex: section.index,
      cards: [],
      createdAt: new Date().toISOString(),
      status: 'pending',
    };

    await fs.writeJson(filePath, flashcardData, { spaces: 2 });
  }

  /**
   * Get the file path for a specific subtopic
   */
  getSubtopicPath(courseId: string, sectionIndex: number, sectionTitle: string, subtopicIndex: number, subtopicTitle: string): string {
    const sectionDirName = `${String(sectionIndex).padStart(2, '0')}-${this.sanitizeFilename(sectionTitle)}`;
    const subtopicFileName = `${String(subtopicIndex).padStart(2, '0')}-${this.sanitizeFilename(subtopicTitle)}.md`;
    
    return path.join(this.generatedDir, courseId, 'sections', sectionDirName, subtopicFileName);
  }

  /**
   * Get the transcript path for a specific subtopic
   */
  getTranscriptPath(courseId: string, sectionIndex: number, sectionTitle: string, subtopicIndex: number, subtopicTitle: string): string {
    const sectionDirName = `${String(sectionIndex).padStart(2, '0')}-${this.sanitizeFilename(sectionTitle)}`;
    const transcriptFileName = `${String(subtopicIndex).padStart(2, '0')}-${this.sanitizeFilename(subtopicTitle)}.transcript.txt`;
    
    return path.join(this.generatedDir, courseId, 'sections', sectionDirName, 'transcripts', transcriptFileName);
  }

  /**
   * Get the slides directory path for a specific subtopic
   */
  getSlidesPath(courseId: string, sectionIndex: number, sectionTitle: string, subtopicIndex: number, subtopicTitle: string): string {
    const sectionDirName = `${String(sectionIndex).padStart(2, '0')}-${this.sanitizeFilename(sectionTitle)}`;
    const slidesDirName = `${String(subtopicIndex).padStart(2, '0')}-${this.sanitizeFilename(subtopicTitle)}`;
    
    return path.join(this.generatedDir, courseId, 'sections', sectionDirName, 'slides', slidesDirName);
  }

  /**
   * Get the audio path for a specific subtopic
   */
  getAudioPath(courseId: string, sectionIndex: number, sectionTitle: string, subtopicIndex: number, subtopicTitle: string): string {
    const sectionDirName = `${String(sectionIndex).padStart(2, '0')}-${this.sanitizeFilename(sectionTitle)}`;
    const audioFileName = `${String(subtopicIndex).padStart(2, '0')}-${this.sanitizeFilename(subtopicTitle)}.mp3`;
    
    return path.join(this.generatedDir, courseId, 'sections', sectionDirName, 'audio', audioFileName);
  }

  /**
   * Get the video path for a specific subtopic
   */
  getVideoPath(courseId: string, sectionIndex: number, sectionTitle: string, subtopicIndex: number, subtopicTitle: string): string {
    const sectionDirName = `${String(sectionIndex).padStart(2, '0')}-${this.sanitizeFilename(sectionTitle)}`;
    const videoFileName = `${String(subtopicIndex).padStart(2, '0')}-${this.sanitizeFilename(subtopicTitle)}.mp4`;
    
    return path.join(this.generatedDir, courseId, 'sections', sectionDirName, 'video', videoFileName);
  }

  /**
   * Sanitize filename by removing/replacing invalid characters
   */
  private sanitizeFilename(filename: string): string {
    return filename
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single
      .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
  }

  /**
   * Check if course directory exists
   */
  async courseExists(courseId: string): Promise<boolean> {
    const courseDir = path.join(this.generatedDir, courseId);
    return await fs.pathExists(courseDir);
  }

  /**
   * Get course directory path
   */
  getCourseDir(courseId: string): string {
    return path.join(this.generatedDir, courseId);
  }

  /**
   * List all generated courses
   */
  async listCourses(): Promise<string[]> {
    if (!await fs.pathExists(this.generatedDir)) {
      return [];
    }

    const items = await fs.readdir(this.generatedDir);
    const courses: string[] = [];

    for (const item of items) {
      const fullPath = path.join(this.generatedDir, item);
      const stats = await fs.stat(fullPath);
      
      if (stats.isDirectory()) {
        courses.push(item);
      }
    }

    return courses;
  }
}
