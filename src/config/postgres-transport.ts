import { TransformableInfo } from 'logform';
import Transport from 'winston-transport';
import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApplicationLog } from '../common/entities/application-log.entity';

@Injectable()
export class PostgresTransport extends Transport {
  constructor(
    @InjectRepository(ApplicationLog)
    private readonly logRepository: Repository<ApplicationLog>,
  ) {
    super();
  }

  log(info: TransformableInfo, callback: () => void): void {
    setImmediate(() => {
      this.emit('logged', info);
    });

    // Extract context from info
    const { level, message, service, userId, requestId, ...context } = info;

    // Create log entry
    const logEntry = this.logRepository.create({
      level: level || 'info',
      message: message || '',
      context: Object.keys(context).length > 0 ? context : null,
      service: service || 'application',
      user_id: userId || null,
      request_id: requestId || null,
      timestamp: new Date(),
    } as any);

    // Save to database (async, don't wait)
    this.logRepository.save(logEntry).catch((error) => {
      console.error('Failed to save log to database:', error);
    });

    callback();
  }
}
