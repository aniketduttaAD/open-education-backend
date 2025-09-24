import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StorageController } from './storage.controller';
import { StorageService } from './services/storage.service';
import { MinioService } from './services/minio.service';
import { File } from './entities';

/**
 * Storage module for file management with MinIO
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([File]),
  ],
  controllers: [StorageController],
  providers: [StorageService, MinioService],
  exports: [StorageService, MinioService],
})
export class StorageModule {}
