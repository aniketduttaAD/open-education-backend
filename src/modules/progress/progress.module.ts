import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProgressController } from './progress.controller';
import { ProgressService } from './services/progress.service';
import { VideoProgress } from './entities';

/**
 * Progress module for video progress and course completion tracking
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      VideoProgress,
    ]),
  ],
  controllers: [ProgressController],
  providers: [ProgressService],
  exports: [ProgressService],
})
export class ProgressModule {}
