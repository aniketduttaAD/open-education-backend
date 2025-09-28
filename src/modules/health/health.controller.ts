import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { HealthCheck, HealthCheckService, TypeOrmHealthIndicator, MemoryHealthIndicator, DiskHealthIndicator } from '@nestjs/terminus';
import { Public } from '../../common/decorators/public.decorator';
import { MinioService } from '../storage/services/minio.service';
import { AIService } from '../ai/services/ai.service';
import { InfrastructureValidationService } from './services/infrastructure-validation.service';

/**
 * Health check controller for monitoring system status
 * Provides comprehensive health checks for all system components
 */
@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private db: TypeOrmHealthIndicator,
    private memory: MemoryHealthIndicator,
    private disk: DiskHealthIndicator,
    private minioService: MinioService,
    private aiService: AIService,
    private infrastructureValidation: InfrastructureValidationService,
  ) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'Basic health check' })
  @ApiResponse({ status: 200, description: 'System is healthy' })
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.db.pingCheck('database'),
      () => this.memory.checkHeap('memory_heap', 150 * 1024 * 1024), // 150MB
      () => this.memory.checkRSS('memory_rss', 150 * 1024 * 1024), // 150MB
    ]);
  }

  @Get('detailed')
  @Public()
  @ApiOperation({ summary: 'Detailed system health check' })
  @ApiResponse({ status: 200, description: 'Detailed system status' })
  @HealthCheck()
  checkDetailed() {
    return this.health.check([
      () => this.db.pingCheck('database'),
      () => this.memory.checkHeap('memory_heap', 150 * 1024 * 1024),
      () => this.memory.checkRSS('memory_rss', 150 * 1024 * 1024),
      () => this.disk.checkStorage('storage', { path: '/', thresholdPercent: 0.9 }),
      () => this.checkMinIO(),
      () => this.checkAI(),
    ]);
  }

  @Get('database')
  @Public()
  @ApiOperation({ summary: 'Database connectivity check' })
  @ApiResponse({ status: 200, description: 'Database is accessible' })
  @HealthCheck()
  checkDatabase() {
    return this.health.check([
      () => this.db.pingCheck('database'),
    ]);
  }

  @Get('storage')
  @Public()
  @ApiOperation({ summary: 'MinIO storage connectivity check' })
  @ApiResponse({ status: 200, description: 'Storage is accessible' })
  @HealthCheck()
  checkStorage() {
    return this.health.check([
      () => this.checkMinIO(),
    ]);
  }

  @Get('ai')
  @Public()
  @ApiOperation({ summary: 'AI services status check' })
  @ApiResponse({ status: 200, description: 'AI services are accessible' })
  @HealthCheck()
  checkAIServices() {
    return this.health.check([
      () => this.checkAI(),
    ]);
  }

  @Get('infrastructure')
  @Public()
  @ApiOperation({ summary: 'Complete infrastructure validation' })
  @ApiResponse({ status: 200, description: 'Infrastructure validation results' })
  async checkInfrastructure() {
    return this.infrastructureValidation.getHealthSummary();
  }

  private async checkMinIO() {
    try {
      await this.minioService.healthCheck();
      return {
        minio: {
          status: 'up',
          message: 'MinIO is accessible',
        },
      } as any;
    } catch (error) {
      return {
        minio: {
          status: 'down',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      } as any;
    }
  }

  private async checkAI() {
    try {
      const healthStatus = await this.aiService.getHealthStatus();
      return {
        ai: {
          status: healthStatus.status === 'healthy' ? 'up' : 'down',
          message: healthStatus.status,
          details: healthStatus,
        },
      } as any;
    } catch (error) {
      return {
        ai: {
          status: 'down',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      } as any;
    }
  }
}
