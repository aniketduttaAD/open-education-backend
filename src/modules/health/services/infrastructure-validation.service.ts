import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createClient } from 'redis';
import * as Minio from 'minio';
import OpenAI from 'openai';
import { RedisWrapper } from '../../../common/utils/redis.util';
import { getMinioConfig, MINIO_BUCKETS } from '../../../config/minio.config';
import { getOpenAIConfig } from '../../../config/openai.config';
import { ApplicationLog } from '../../../common/entities/application-log.entity';

export interface InfrastructureStatus {
  database: {
    status: 'healthy' | 'unhealthy';
    details: string;
    connectionTime?: number;
  };
  redis: {
    status: 'healthy' | 'unhealthy';
    details: string;
    connectionTime?: number;
  };
  minio: {
    status: 'healthy' | 'unhealthy';
    details: string;
    buckets: {
      [key: string]: 'exists' | 'missing' | 'error';
    };
  };
  openai: {
    status: 'healthy' | 'unhealthy';
    details: string;
    models: {
      embedding: boolean;
      chat: boolean;
      tts: boolean;
    };
  };
  pgvector: {
    status: 'healthy' | 'unhealthy';
    details: string;
    extensionVersion?: string;
  };
}

/**
 * Service for validating infrastructure components
 * Ensures all required services are properly configured and accessible
 */
@Injectable()
export class InfrastructureValidationService {
  private readonly logger = new Logger(InfrastructureValidationService.name);

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(ApplicationLog)
    private readonly logRepository: Repository<ApplicationLog>,
  ) {}

  /**
   * Validate all infrastructure components
   */
  async validateInfrastructure(): Promise<InfrastructureStatus> {
    this.logger.log('Starting infrastructure validation...');

    const [database, redis, minio, openai, pgvector] = await Promise.allSettled([
      this.validateDatabase(),
      this.validateRedis(),
      this.validateMinIO(),
      this.validateOpenAI(),
      this.validatePgVector(),
    ]);

    const status: InfrastructureStatus = {
      database: database.status === 'fulfilled' ? database.value : { status: 'unhealthy', details: database.reason?.message || 'Unknown error' },
      redis: redis.status === 'fulfilled' ? redis.value : { status: 'unhealthy', details: redis.reason?.message || 'Unknown error' },
      minio: minio.status === 'fulfilled' ? minio.value : { status: 'unhealthy', details: minio.reason?.message || 'Unknown error', buckets: {} },
      openai: openai.status === 'fulfilled' ? openai.value : { status: 'unhealthy', details: openai.reason?.message || 'Unknown error', models: { embedding: false, chat: false, tts: false } },
      pgvector: pgvector.status === 'fulfilled' ? pgvector.value : { status: 'unhealthy', details: pgvector.reason?.message || 'Unknown error' },
    };

    this.logger.log('Infrastructure validation completed');
    return status;
  }

  /**
   * Validate database connection and basic functionality
   */
  private async validateDatabase(): Promise<InfrastructureStatus['database']> {
    const startTime = Date.now();
    
    try {
      // Test basic query
      await this.logRepository.query('SELECT 1');
      
      const connectionTime = Date.now() - startTime;
      
      return {
        status: 'healthy',
        details: 'Database connection successful',
        connectionTime,
      };
    } catch (error) {
      this.logger.error('Database validation failed:', error);
      return {
        status: 'unhealthy',
        details: `Database connection failed: ${error.message}`,
      };
    }
  }

  /**
   * Validate Redis connection and basic functionality
   */
  private async validateRedis(): Promise<InfrastructureStatus['redis']> {
    const startTime = Date.now();
    
    try {
      const redisUrl = this.configService.get<string>('REDIS_URL') || 'redis://:openedu_redis_dev@localhost:6379';
      
      // Test Redis connection
      const client = await RedisWrapper.getClient({ url: redisUrl });
      
      // Test basic operations
      const testKey = 'infra_test_' + Date.now();
      await client.set(testKey, 'test_value', { EX: 10 });
      const value = await client.get(testKey);
      await client.del(testKey);
      
      if (value !== 'test_value') {
        throw new Error('Redis read/write test failed');
      }
      
      const connectionTime = Date.now() - startTime;
      
      return {
        status: 'healthy',
        details: 'Redis connection and operations successful',
        connectionTime,
      };
    } catch (error) {
      this.logger.error('Redis validation failed:', error);
      return {
        status: 'unhealthy',
        details: `Redis connection failed: ${error.message}`,
      };
    }
  }

  /**
   * Validate MinIO connection and bucket existence
   */
  private async validateMinIO(): Promise<InfrastructureStatus['minio']> {
    try {
      const config = getMinioConfig(this.configService);
      const minioClient = new Minio.Client({
        endPoint: config.endPoint,
        port: config.port,
        useSSL: config.useSSL,
        accessKey: config.accessKey,
        secretKey: config.secretKey,
      });

      // Test connection
      await minioClient.listBuckets();

      // Check required buckets
      const buckets: { [key: string]: 'exists' | 'missing' | 'error' } = {};
      
      for (const [bucketName, bucketValue] of Object.entries(MINIO_BUCKETS)) {
        try {
          const exists = await minioClient.bucketExists(bucketValue);
          buckets[bucketName] = exists ? 'exists' : 'missing';
        } catch (error) {
          buckets[bucketName] = 'error';
          this.logger.warn(`Failed to check bucket ${bucketValue}:`, error);
        }
      }

      const missingBuckets = Object.values(buckets).filter(status => status === 'missing');
      const errorBuckets = Object.values(buckets).filter(status => status === 'error');

      let details = 'MinIO connection successful';
      if (missingBuckets.length > 0) {
        details += `, ${missingBuckets.length} buckets missing`;
      }
      if (errorBuckets.length > 0) {
        details += `, ${errorBuckets.length} bucket check errors`;
      }

      return {
        status: 'healthy',
        details,
        buckets,
      };
    } catch (error) {
      this.logger.error('MinIO validation failed:', error);
      return {
        status: 'unhealthy',
        details: `MinIO connection failed: ${error.message}`,
        buckets: {},
      };
    }
  }

  /**
   * Validate OpenAI API connection and model availability
   */
  private async validateOpenAI(): Promise<InfrastructureStatus['openai']> {
    try {
      const config = getOpenAIConfig(this.configService);
      const openai = new OpenAI({ apiKey: config.apiKey });

      // Test API connection with a simple request
      const models = await openai.models.list();
      const modelIds = models.data.map(model => model.id);

      const embeddingAvailable = modelIds.includes(config.embeddingModel);
      const chatAvailable = modelIds.includes(config.chatModel);
      const ttsAvailable = modelIds.includes(config.ttsModel);

      const missingModels = [];
      if (!embeddingAvailable) missingModels.push(config.embeddingModel);
      if (!chatAvailable) missingModels.push(config.chatModel);
      if (!ttsAvailable) missingModels.push(config.ttsModel);

      let details = 'OpenAI API connection successful';
      if (missingModels.length > 0) {
        details += `, missing models: ${missingModels.join(', ')}`;
      }

      return {
        status: missingModels.length === 0 ? 'healthy' : 'unhealthy',
        details,
        models: {
          embedding: embeddingAvailable,
          chat: chatAvailable,
          tts: ttsAvailable,
        },
      };
    } catch (error) {
      this.logger.error('OpenAI validation failed:', error);
      return {
        status: 'unhealthy',
        details: `OpenAI API connection failed: ${error.message}`,
        models: {
          embedding: false,
          chat: false,
          tts: false,
        },
      };
    }
  }

  /**
   * Validate pgvector extension
   */
  private async validatePgVector(): Promise<InfrastructureStatus['pgvector']> {
    try {
      // Check if pgvector extension is installed
      const result = await this.logRepository.query(`
        SELECT extversion 
        FROM pg_extension 
        WHERE extname = 'vector'
      `);

      if (result.length === 0) {
        return {
          status: 'unhealthy',
          details: 'pgvector extension not installed',
        };
      }

      const version = result[0].extversion;

      // Test vector operations
      await this.logRepository.query(`
        SELECT '[1,2,3]'::vector <-> '[4,5,6]'::vector as distance
      `);

      return {
        status: 'healthy',
        details: 'pgvector extension working correctly',
        extensionVersion: version,
      };
    } catch (error) {
      this.logger.error('pgvector validation failed:', error);
      return {
        status: 'unhealthy',
        details: `pgvector validation failed: ${error.message}`,
      };
    }
  }

  /**
   * Get infrastructure health summary
   */
  async getHealthSummary(): Promise<{
    overall: 'healthy' | 'degraded' | 'unhealthy';
    components: InfrastructureStatus;
    timestamp: string;
  }> {
    const components = await this.validateInfrastructure();
    
    const healthyCount = Object.values(components).filter(comp => comp.status === 'healthy').length;
    const totalCount = Object.keys(components).length;
    
    let overall: 'healthy' | 'degraded' | 'unhealthy';
    if (healthyCount === totalCount) {
      overall = 'healthy';
    } else if (healthyCount >= totalCount * 0.7) {
      overall = 'degraded';
    } else {
      overall = 'unhealthy';
    }

    return {
      overall,
      components,
      timestamp: new Date().toISOString(),
    };
  }
}
