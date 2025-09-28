import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import * as fs from 'fs-extra';
import * as path from 'path';
import { OpenAIService } from '../../ai/services/openai.service';
import { VideoGenerationService } from '../../ai/services/video-generation.service';
import { MinioService } from '../../storage/services/minio.service';
import { MINIO_BUCKETS } from '../../../config/minio.config';

@Processor('content-generation')
export class ContentGenerationProcessor extends WorkerHost {
  private readonly logger = new Logger(ContentGenerationProcessor.name);

  constructor(
    private readonly openai: OpenAIService,
    private readonly minio: MinioService,
    private readonly videoGen: VideoGenerationService,
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    const { id, section, subtopic, index, roadmap } = job.data;
    this.logger.log(`Job ${job.id} started: ${section} / ${subtopic}`);

    // 1) Generate slides + transcript via OpenAI
    const content = await this.openai.generateTopicContent(
      subtopic,
      `Auto-generated from roadmap section ${section}`,
      JSON.stringify(roadmap),
    );
    const slidesMd = content.slides.map((s) => `## ${s.title}\n\n${s.content}`).join('\n\n');
    const markdown = `# ${subtopic}\n\n${slidesMd}`;

    // Paths under generated/<id>/
    const baseDir = path.join(process.cwd(), 'generated', id);
    const sectionDir = path.join(baseDir, 'sections', section);
    const transcriptsDir = path.join(sectionDir, 'transcripts');
    const slidesDir = path.join(sectionDir, 'slides', subtopic);
    const audioDir = path.join(sectionDir, 'audio');
    const videoDir = path.join(sectionDir, 'video');
    await fs.ensureDir(transcriptsDir);
    await fs.ensureDir(slidesDir);
    await fs.ensureDir(audioDir);
    await fs.ensureDir(videoDir);

    const mdFile = path.join(sectionDir, `${subtopic}.md`);
    await fs.outputFile(mdFile, markdown);
    this.logger.log(`markdown_done ${mdFile}`);

    // 2) Generate transcript from markdown
    const transcript = await this.openai.generateTranscriptFromMarkdown(subtopic, section, markdown);
    const transcriptFile = path.join(transcriptsDir, `${subtopic}.transcript.txt`);
    await fs.outputFile(transcriptFile, transcript);
    this.logger.log(`transcript_done ${transcriptFile}`);

    // 3) Slides done via content generation (already included)
    await fs.outputFile(path.join(slidesDir, 'slides.md'), slidesMd);
    this.logger.log(`slides_done ${slidesDir}`);

    // 4) Generate audio+video via VideoGenerationService
    const videoResult = await this.videoGen.generateVideo({
      title: `${section} - ${subtopic}`,
      slides: content.slides.map((s) => s.content),
      transcript: content.transcript,
    });
    this.logger.log(`video_done ${videoResult.videoPath}`);

    // 5) Upload final MP4 to MinIO
    const videoBuffer = await fs.readFile(videoResult.videoPath);
    const videoObject = `${section}/${subtopic}.mp4`;
    await this.minio.uploadFile(MINIO_BUCKETS.COURSES, videoObject, videoBuffer, 'video/mp4');
    this.logger.log(`upload_done ${videoObject}`);

    return { section, subtopic, object: videoObject };
  }

  @OnWorkerEvent('completed')
  onCompleted({ jobId }: { jobId: string }) {
    this.logger.log(`job_completed ${jobId}`);
  }

  @OnWorkerEvent('failed')
  onFailed({ jobId, failedReason }: { jobId: string; failedReason: string }) {
    this.logger.error(`job_failed ${jobId} reason=${failedReason}`);
  }
}


