import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { StorageModule } from '../storage/storage.module';
import { AIModule } from '../ai/ai.module';

/**
 * Health check module for system monitoring
 * Provides health check endpoints for all system components
 */
@Module({
  imports: [
    TerminusModule,
    StorageModule,
    AIModule,
  ],
  controllers: [HealthController],
})
export class HealthModule {}
