import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { CacheModule } from '@nestjs/cache-manager';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { QueueService } from './services/queue.service';
import { VideoGenerationProcessor } from './processors/video-generation.processor';
import { AIContentProcessor } from './processors/ai-content.processor';
import { TutorVerificationProcessor } from './processors/tutor-verification.processor';
import { ContentGenerationProcessor } from './processors/content-generation.processor';
import { EnhancedContentGenerationProcessor } from './processors/enhanced-content-generation.processor';
import { User } from '../auth/entities/user.entity';
import { TutorDocument } from '../users/entities/tutor-document.entity';
import { CourseGenerationProgress, CourseSection, CourseSubtopic } from '../courses/entities';
import { AIModule } from '../ai/ai.module';
import { StorageModule } from '../storage/storage.module';
import { WebSocketModule } from '../websocket/websocket.module';

/**
 * Queue module for background job processing
 * Uses in-memory cache for job management
 */
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        connection: {
          url: configService.get<string>('REDIS_URL'),
        },
      }),
      inject: [ConfigService],
    }),
    BullModule.registerQueue({ name: 'content-generation' }),
    CacheModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        ttl: 3600000, // 1 hour - hardcoded
        max: 1000, // 1000 items - hardcoded
        isGlobal: true,
      }),
      inject: [ConfigService],
    }),
    TypeOrmModule.forFeature([User, TutorDocument, CourseGenerationProgress, CourseSection, CourseSubtopic]),
    forwardRef(() => AIModule),
    forwardRef(() => StorageModule),
    forwardRef(() => WebSocketModule),
  ],
  providers: [
    QueueService,
    VideoGenerationProcessor,
    AIContentProcessor,
    TutorVerificationProcessor,
    ContentGenerationProcessor,
    EnhancedContentGenerationProcessor,
  ],
  exports: [QueueService, CacheModule],
})
export class QueueModule {}
