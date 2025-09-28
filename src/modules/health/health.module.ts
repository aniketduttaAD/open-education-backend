import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HealthController } from './health.controller';
import { InfrastructureValidationService } from './services/infrastructure-validation.service';
import { StorageModule } from '../storage/storage.module';
import { AIModule } from '../ai/ai.module';
import { ApplicationLog } from '../../common/entities/application-log.entity';

/**
 * Health check module for system monitoring
 * Provides health check endpoints for all system components
 */
@Module({
  imports: [
    TerminusModule,
    TypeOrmModule.forFeature([ApplicationLog]),
    StorageModule,
    AIModule,
  ],
  controllers: [HealthController],
  providers: [InfrastructureValidationService],
  exports: [InfrastructureValidationService],
})
export class HealthModule {}
