import { Injectable, Logger, Inject, forwardRef, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { RedisWrapper } from '../../common/utils/redis.util';
import getOpenAIConfig from '../../config/openai.config';
import OpenAI from 'openai';
import { EditRoadmapDto } from './dto/edit-roadmap.dto';
import { FinalizeRoadmapDto } from './dto/finalize-roadmap.dto';
import { Queue } from 'bullmq';
import { CoursesService } from '../courses/services/courses.service';
import { CourseRoadmap, CourseGenerationProgress, CourseSection, CourseSubtopic } from '../courses/entities';

interface GenerateRoadmapDto {
  prompt: string;
  level?: 'beginner' | 'intermediate' | 'advanced';
  durationWeeks?: number;
  weeklyCommitmentHours?: number;
  techStackPrefs?: Record<string, any>;
  constraints?: string[];
  outputFormat?: 'json' | 'markdown' | 'both';
}

@Injectable()
export class RoadmapsService {
  private readonly ttlSeconds = 172800; // 2 days
  private readonly redisUrl: string;
  private readonly openai: OpenAI;
  private readonly logger = new Logger(RoadmapsService.name);

  constructor(
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => CoursesService))
    private readonly coursesService: CoursesService,
    @InjectRepository(CourseRoadmap)
    private readonly roadmapRepository: Repository<CourseRoadmap>,
    @InjectRepository(CourseGenerationProgress)
    private readonly progressRepository: Repository<CourseGenerationProgress>,
    @InjectRepository(CourseSection)
    private readonly sectionRepository: Repository<CourseSection>,
    @InjectRepository(CourseSubtopic)
    private readonly subtopicRepository: Repository<CourseSubtopic>,
  ) {
    this.redisUrl = this.configService.get<string>('REDIS_URL') || 'redis://:openedu_redis_dev@localhost:6379/0';
    const ai = getOpenAIConfig(this.configService);
    this.openai = new OpenAI({ apiKey: ai.apiKey });
  }

  private buildUserPrompt(dto: GenerateRoadmapDto): string {
    const techStackPrefsJson = JSON.stringify(dto.techStackPrefs || {});
    return [
      'User intent:',
      dto.prompt,
      '',
      'Constraints and preferences (optional):',
      `level: ${dto.level ?? 'beginner'}`,
      `durationWeeks: ${dto.durationWeeks ?? ''}`,
      `weeklyCommitmentHours: ${dto.weeklyCommitmentHours ?? ''}`,
      `techStackPrefs: ${techStackPrefsJson}`,
      '',
      'Generate a comprehensive learning roadmap as a JSON object.',
      'Create main topic categories that are relevant to the learning goal.',
      'Each main topic should contain an array of specific subtopics.',
      'Structure: { "Main Topic Name": ["subtopic1", "subtopic2", ...], ... }',
      'Ensure the roadmap is well-organized, progressive, and covers all necessary areas.',
      'Return ONLY valid JSON with no additional text or formatting.',
    ].join('\n');
  }

  private systemPrompt(): string {
    return [
      'You are a senior curriculum designer and learning path expert.',
      'Create comprehensive, well-structured learning roadmaps based on user requirements.',
      'CRITICAL REQUIREMENTS:',
      '- Output MUST be valid JSON and ONLY JSON. No backticks, no prose, no markdown.',
      '- Create main topic categories that are relevant to the learning goal.',
      '- Each main topic should contain an array of specific, actionable subtopics.',
      '- Structure: { "Main Topic Name": ["subtopic1", "subtopic2", ...], ... }',
      '- Keep subtopics concise, actionable, and progressive.',
      '- Ensure the roadmap covers all necessary areas for the learning goal.',
      '- Adapt the structure to fit the specific domain and learning objectives.',
    ].join('\n');
  }

  private async askModelForJson(dto: GenerateRoadmapDto): Promise<string> {
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: this.systemPrompt() },
      { role: 'user', content: this.buildUserPrompt(dto) },
    ];
    const model = this.configService.get<string>('OPENAI_CHAT_MODEL') || 'gpt-4.1-mini';
    const temperature = 0.3;
    const response = await this.openai.chat.completions.create({
      model,
      messages,
      temperature,
      response_format: { type: 'json_object' },
    });
    const content = response.choices?.[0]?.message?.content || '';
    return content;
  }

  private async repairToJsonOnly(raw: string): Promise<string> {
    // If parsing fails, make a second call to reformat into JSON only.
    try {
      JSON.parse(raw);
      return raw;
    } catch {}

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: 'Output ONLY a valid JSON object. No prose, no code fences.' },
      {
        role: 'user',
        content: [
          'The following content should be a pure JSON object mapping main topics to arrays of subtopics.',
          'If it is not valid JSON, transform it into valid JSON only, preserving content.',
          'No prose, no code fences. Output ONLY the JSON object.',
          '',
          'Content:',
          raw,
        ].join('\n'),
      },
    ];
    const model = this.configService.get<string>('OPENAI_CHAT_MODEL') || 'gpt-4.1-mini';
    const response = await this.openai.chat.completions.create({
      model,
      messages,
      temperature: 0,
      response_format: { type: 'json_object' },
    });
    return response.choices?.[0]?.message?.content || '{}';
  }

  private validateRoadmapJson(obj: any): boolean {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
    
    // Ensure at least one main topic exists
    const keys = Object.keys(obj);
    if (keys.length === 0) return false;
    
    // Validate that all values are arrays of strings
    for (const key of keys) {
      const value = obj[key];
      if (!Array.isArray(value)) return false;
      
      // Ensure all subtopics are non-empty strings
      for (const subtopic of value) {
        if (typeof subtopic !== 'string' || subtopic.trim().length === 0) {
          return false;
        }
      }
    }
    
    return true;
  }

  private buildStoragePayload(id: string, userQuery: string, data: any) {
    const now = new Date().toISOString();
    return {
      id,
      data,
      user_query: userQuery,
      version: 1,
      created_at: now,
      updated_at: now,
    };
  }

  async generate(dto: GenerateRoadmapDto, courseId?: string, tutorId?: string) {
    if (!dto?.prompt || dto.prompt.trim().length === 0) {
      throw new Error('prompt is required');
    }

    // Validate course ownership if courseId provided
    if (courseId && tutorId) {
      await this.validateCourseOwnership(courseId, tutorId);
    }

    const id = `temp_${uuidv4()}`;

    try {
      // 1) Ask model for JSON (with enforced json_object)
      let raw = await this.askModelForJson(dto);
      // 2) Try parse; if fails, repair once
      try {
        JSON.parse(raw);
      } catch {
        raw = await this.repairToJsonOnly(raw);
      }

      const data = JSON.parse(raw);
      if (!this.validateRoadmapJson(data)) {
        throw new Error('Invalid roadmap JSON structure');
      }

      // 3) Save to Redis with TTL
      const client = await RedisWrapper.getClient({ url: this.redisUrl });
      const payload = this.buildStoragePayload(id, dto.prompt, data);
      await RedisWrapper.setEx(`roadmap:${id}`, this.ttlSeconds, payload);

      // Convert to hierarchical structure for consistent response format
      const hierarchicalData = this.convertToHierarchicalStructure(data);
      return { id, data: hierarchicalData };
    } catch (error) {
      throw error;
    }
  }

  private convertToHierarchicalStructure(flatData: any): any {
    const hierarchical = {
      id: 'course',
      main_topics: []
    };

    for (const [sectionName, subtopics] of Object.entries(flatData)) {
      const mainTopic = {
        id: `main_${Math.random().toString(36).substr(2, 9)}`,
        title: sectionName,
        subtopics: []
      };

      if (Array.isArray(subtopics)) {
        subtopics.forEach((subtopic, index) => {
          mainTopic.subtopics.push({
            id: `sub_${Math.random().toString(36).substr(2, 9)}`,
            title: subtopic
          });
        });
      }

      hierarchical.main_topics.push(mainTopic);
    }

    return hierarchical;
  }

  private convertToFlatStructure(hierarchicalData: any): any {
    const flatData = {};
    
    if (hierarchicalData.main_topics) {
      hierarchicalData.main_topics.forEach(mainTopic => {
        flatData[mainTopic.title] = mainTopic.subtopics.map(subtopic => subtopic.title);
      });
    }

    return flatData;
  }



  private buildEditSystemPrompt(): string {
    return [
      'You will receive an existing roadmap (JSON object) and a list of user edits.',
      'Apply the edits precisely and return a new roadmap as a valid JSON object, maintaining coherence.',
      'Rules:',
      '- Keep unrelated sections intact.',
      '- If a change references a subtopic index, replace/add/remove at that index.',
      '- If a change references only the section, append or remove accordingly.',
      '- When removing a main topic (section), remove the entire section and all its subtopics.',
      '- When adding a new main topic, create it as a new section with the provided subtopic.',
      '- When removing a main topic, ensure the section is completely removed from the roadmap.',
      '- Maintain the course->maintopic[subtopics] structure in all operations.',
      '- Ensure the final output is VALID JSON and ONLY JSON.',
    ].join('\n');
  }

  private async applyMultipleChangesWithAI(hierarchicalData: any, changes: any[]): Promise<any> {
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: this.buildEditSystemPrompt() },
      {
        role: 'user',
        content: [
          'Current roadmap:',
          JSON.stringify(hierarchicalData, null, 2),
          '',
          'Requested changes:',
          JSON.stringify(changes, null, 2),
        ].join('\n'),
      },
    ];

    const model = this.configService.get<string>('OPENAI_CHAT_MODEL') || 'gpt-4.1-mini';
    const response = await this.openai.chat.completions.create({
      model,
      messages,
      temperature: 0.2,
      response_format: { type: 'json_object' },
    });

    const result = JSON.parse(response.choices?.[0]?.message?.content || '{}');
    
    // Convert back to hierarchical structure if needed
    if (result.main_topics) {
      return result;
    }
    
    // If it's flat structure, convert to hierarchical
    return this.convertToHierarchicalStructure(result);
  }

  async edit(dto: EditRoadmapDto, courseId?: string, tutorId?: string) {
    if (!dto?.roadmapId) {
      throw new Error('roadmapId is required');
    }
    if (!dto?.changes || dto.changes.length === 0) {
      throw new Error('changes are required');
    }

    // Validate course ownership if courseId provided
    if (courseId && tutorId) {
      await this.validateCourseOwnership(courseId, tutorId);
    }

    const client = await RedisWrapper.getClient({ url: this.redisUrl });
    const key = `roadmap:${dto.roadmapId}`;
    const existing = await RedisWrapper.getJson<any>(key);
    if (!existing) {
      throw new Error('roadmap id not found');
    }

    this.logger.log(`Editing roadmap ${dto.roadmapId} with ${dto.changes.length} change(s)`);

    try {
      // Convert existing data to hierarchical structure with IDs
      const hierarchicalData = this.convertToHierarchicalStructure(existing.data);
      
      // Apply all changes with single AI call
      const updatedData = await this.applyMultipleChangesWithAI(hierarchicalData, dto.changes);
      
      // Convert back to flat structure for storage
      const flatData = this.convertToFlatStructure(updatedData);
      
      if (!this.validateRoadmapJson(flatData)) {
        throw new Error('Invalid roadmap JSON after edits');
      }

      // Create new version with incremented version number
      const newVersion = (existing.version || 1) + 1;
      const now = new Date().toISOString();
      
      // Store new version in Redis
      const newPayload = {
        ...existing,
        data: flatData,
        version: newVersion,
        updated_at: now,
      };
      await RedisWrapper.setEx(key, this.ttlSeconds, newPayload);

      // Store in database if courseId provided
      if (courseId && tutorId) {
        await this.saveRoadmapVersion(courseId, tutorId, dto.roadmapId, flatData, newVersion);
      }

      // Clean up old versions after successful generation
      await this.cleanupOldVersions(dto.roadmapId, newVersion);

      this.logger.log(`Roadmap ${dto.roadmapId} updated to version ${newVersion}`);
      return { 
        id: dto.roadmapId, 
        data: updatedData, 
        version: newVersion 
      };
    } catch (error) {
      throw error;
    }
  }

  async finalize(dto: FinalizeRoadmapDto, courseId?: string, tutorId?: string) {
    if (!dto?.id) throw new Error('id is required');

    // Validate course ownership if courseId provided
    if (courseId && tutorId) {
      await this.validateCourseOwnership(courseId, tutorId);
    }

    const key = `roadmap:${dto.id}`;
    const client = await RedisWrapper.getClient({ url: this.redisUrl });
    const existing = await RedisWrapper.getJson<any>(key);
    if (!existing?.data) throw new Error('roadmap id not found');

    const totalSubtopics = Object.values(existing.data).reduce((sum: number, subtopics: any) => sum + subtopics.length, 0);
    const totalSections = Object.keys(existing.data).length;

    try {
      // 1. Create database entries for roadmap, sections, and subtopics
      const roadmap = await this.roadmapRepository.save({
        course_id: courseId!,
        tutor_user_id: tutorId!,
        roadmap_data: existing.data,
        status: 'finalizing',
        redis_key: key,
        finalized_at: new Date(),
      });

      // 2. Create course sections and subtopics
      const sectionEntries = [];
      let sectionIndex = 0;

      for (const [sectionTitle, subtopics] of Object.entries(existing.data)) {
        if (!Array.isArray(subtopics)) continue;

        // Create section
        const section = await this.sectionRepository.save({
          course_id: courseId!,
          index: sectionIndex,
          title: sectionTitle,
        });

        sectionEntries.push(section);

        // Create subtopics for this section
        for (let subtopicIndex = 0; subtopicIndex < subtopics.length; subtopicIndex++) {
          await this.subtopicRepository.save({
            section_id: section.id,
            index: subtopicIndex,
            title: String(subtopics[subtopicIndex]),
            status: 'pending',
          });
        }

        sectionIndex++;
      }

      // 3. Initialize course_generation_progress
      const sessionId = uuidv4();
      const progress = await this.progressRepository.save({
        course_id: courseId!,
        roadmap_id: roadmap.id,
        status: 'processing',
        current_step: 'initializing',
        progress_percentage: 0,
        current_section_index: 0,
        current_subtopic_index: 0,
        total_sections: totalSections,
        total_subtopics: totalSubtopics,
        estimated_time_remaining: Math.ceil(Number(totalSubtopics) * 8), // 8 minutes per subtopic estimate
        websocket_session_id: sessionId,
        started_at: new Date(),
      } as any);

      // 4. Clear old Redis versions (keep 2-day cleanup)
      await this.cleanupOldRoadmaps();

      // 5. Start WebSocket session (if needed for content generation)
      // Note: WebSocket session ID is stored in progress for content generation pipeline

      // 6. Trigger content generation pipeline
      const queue = new Queue('content-generation', { connection: { url: this.redisUrl } as any });

      // Enqueue content generation job
      await queue.add('generate-course-content', {
        courseId,
        roadmapId: roadmap.id,
        progressId: (progress as any).id,
        roadmapData: existing.data,
        sessionId,
      }, {
        removeOnComplete: 5,
        removeOnFail: 10,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        }
      });

      // Update roadmap status to finalized
      await this.roadmapRepository.update(roadmap.id, { status: 'finalized' });

      this.logger.log(`Roadmap ${dto.id} finalized for course ${courseId} with ${totalSubtopics} subtopics`);

      return {
        id: dto.id,
        roadmapId: roadmap.id,
        progressId: (progress as any).id,
        sessionId,
        totalSections,
        totalSubtopics
      };
    } catch (error) {
      this.logger.error(`Failed to finalize roadmap ${dto.id}:`, error);
      throw error;
    }
  }

  /**
   * Clean up old roadmaps from Redis (2-day retention)
   */
  private async cleanupOldRoadmaps(): Promise<void> {
    try {
      const client = await RedisWrapper.getClient({ url: this.redisUrl });
      const keys = await client.keys('roadmap:temp_*');

      let deletedCount = 0;
      const cutoffTime = Date.now() - (2 * 24 * 60 * 60 * 1000); // 2 days ago

      for (const key of keys) {
        const roadmap = await RedisWrapper.getJson<any>(key);
        if (roadmap?.created_at) {
          const createdTime = new Date(roadmap.created_at).getTime();
          if (createdTime < cutoffTime) {
            await client.del(key);
            deletedCount++;
          }
        }
      }

      if (deletedCount > 0) {
        this.logger.log(`Cleaned up ${deletedCount} old roadmaps from Redis`);
      }
    } catch (error) {
      this.logger.error('Failed to cleanup old roadmaps:', error);
    }
  }

  /**
   * Save roadmap version to database
   */
  private async saveRoadmapVersion(courseId: string, tutorId: string, roadmapId: string, data: any, version: number): Promise<void> {
    try {
      await this.roadmapRepository.save({
        course_id: courseId,
        tutor_user_id: tutorId,
        roadmap_data: data,
        status: 'draft',
        redis_key: `roadmap:${roadmapId}`,
        finalized_at: null,
      });
      this.logger.log(`Saved roadmap version ${version} to database for course ${courseId}`);
    } catch (error) {
      this.logger.error(`Failed to save roadmap version ${version} to database:`, error);
      throw error;
    }
  }

  /**
   * Clean up old versions after successful generation
   */
  private async cleanupOldVersions(roadmapId: string, currentVersion: number): Promise<void> {
    try {
      const client = await RedisWrapper.getClient({ url: this.redisUrl });
      const key = `roadmap:${roadmapId}`;
      
      // Get current roadmap data
      const current = await RedisWrapper.getJson<any>(key);
      if (!current) return;

      // Keep only the latest version in Redis
      const latestPayload = {
        ...current,
        version: currentVersion,
        updated_at: new Date().toISOString(),
      };
      
      await RedisWrapper.setEx(key, this.ttlSeconds, latestPayload);
      
      this.logger.log(`Cleaned up old versions for roadmap ${roadmapId}, keeping version ${currentVersion}`);
    } catch (error) {
      this.logger.error(`Failed to cleanup old versions for roadmap ${roadmapId}:`, error);
    }
  }

  /**
   * Validate that the tutor owns the course
   */
  private async validateCourseOwnership(courseId: string, tutorId: string): Promise<void> {
    try {
      const course = await this.coursesService.getCourseById(courseId);
      if (!course) {
        throw new ForbiddenException('Course not found');
      }

      if (course.tutor_user_id !== tutorId) {
        throw new ForbiddenException('You can only manage roadmaps for your own courses');
      }
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw error;
      }
      this.logger.error(`Failed to validate course ownership for course ${courseId} and tutor ${tutorId}:`, error);
      throw new ForbiddenException('Failed to validate course access');
    }
  }
}


