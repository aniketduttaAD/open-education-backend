import { Module, forwardRef } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { QueueService } from './services/queue.service';
import { VideoGenerationProcessor } from './processors/video-generation.processor';
import { AIContentProcessor } from './processors/ai-content.processor';
import { TutorVerificationProcessor } from './processors/tutor-verification.processor';
import { User } from '../auth/entities/user.entity';
import { TutorDocument } from '../users/entities/tutor-document.entity';
import { AIModule } from '../ai/ai.module';

/**
 * Queue module for background job processing
 * Uses in-memory cache for job management
 */
@Module({
  imports: [
    CacheModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        ttl: 3600000, // 1 hour - hardcoded
        max: 1000, // 1000 items - hardcoded
        isGlobal: true,
      }),
      inject: [ConfigService],
    }),
    TypeOrmModule.forFeature([User, TutorDocument]),
    forwardRef(() => AIModule),
  ],
  providers: [
    QueueService,
    VideoGenerationProcessor,
    AIContentProcessor,
    TutorVerificationProcessor,
  ],
  exports: [QueueService, CacheModule],
})
export class QueueModule {}
