import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StorageController } from './storage.controller';
import { StorageService } from './services/storage.service';
import { MinioService } from './services/minio.service';
import { CleanupService } from './services/cleanup.service';
import { FileStructureService } from './services/file-structure.service';
import { File } from './entities';
import { CoursesModule } from '../courses/courses.module';

/**
 * Storage module for file management with MinIO
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([File]),
    CoursesModule,
  ],
  controllers: [StorageController],
  providers: [StorageService, MinioService, CleanupService, FileStructureService],
  exports: [StorageService, MinioService, CleanupService, FileStructureService],
})
export class StorageModule {}
