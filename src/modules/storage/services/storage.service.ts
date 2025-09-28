import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { File, FileType } from '../entities';
import { MinioService } from './minio.service';
import { UploadFileDto, GenerateSignedUrlDto } from '../dto';
import { MINIO_BUCKETS } from '../../../config/minio.config';

/**
 * Storage service for managing file operations with MinIO
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  constructor(
    @InjectRepository(File)
    private fileRepository: Repository<File>,
    private minioService: MinioService,
  ) {}

  /**
   * Upload file with metadata
   */
  async uploadFile(
    userId: string,
    file: any,
    uploadData: UploadFileDto,
  ): Promise<File> {
    this.logger.log(`Uploading file for user: ${userId}`);

    try {
      const bucketName = this.minioService.getBucketForFileType(file.mimetype);
      const objectName = this.minioService.generateObjectName(file.originalname, userId);
      
      // Process image if it's an image file
      let processedBuffer = file.buffer;
      let thumbnailBuffer: Buffer | undefined;

      if (file.mimetype.startsWith('image/')) {
        // Generate thumbnail
        thumbnailBuffer = await this.minioService.generateThumbnail(file.buffer);
        
        // Process main image
        processedBuffer = await this.minioService.processImage(file.buffer, {
          width: 1920,
          height: 1080,
          quality: 85,
          format: 'jpeg',
        });
      }

      // Upload main file
      const fileUrl = await this.minioService.uploadFile(
        bucketName,
        objectName,
        processedBuffer,
        file.mimetype,
      );

      // Upload thumbnail if generated
      let thumbnailUrl: string | undefined;
      if (thumbnailBuffer) {
        const thumbnailObjectName = `thumbnails/${objectName}`;
        thumbnailUrl = await this.minioService.uploadFile(
          bucketName,
          thumbnailObjectName,
          thumbnailBuffer,
          'image/jpeg',
        );
      }

      // Save file metadata to database
      const fileEntity = this.fileRepository.create({
        user_id: userId,
        file_name: file.originalname,
        original_name: file.originalname,
        file_type: (uploadData.file_type || this.getFileTypeFromMime(file.mimetype)) as FileType,
        mime_type: file.mimetype,
        file_size: file.size,
        file_url: fileUrl,
        bucket_name: bucketName,
        object_key: objectName,
        status: 'ready' as const,
        is_public: uploadData.is_public || false,
        metadata: uploadData.metadata ? JSON.parse(uploadData.metadata) : undefined,
        thumbnail_url: thumbnailUrl,
        expires_at: uploadData.expires_at ? new Date(uploadData.expires_at) : undefined,
      });

      const savedFile = await this.fileRepository.save(fileEntity);
      this.logger.log(`File uploaded successfully: ${savedFile.id}`);
      
      return savedFile;
    } catch (error) {
      this.logger.error(`Failed to upload file:`, error);
      throw new BadRequestException('Failed to upload file');
    }
  }

  /**
   * Generate presigned URL for direct upload
   */
  async generateSignedUrl(
    userId: string,
    signedUrlData: GenerateSignedUrlDto,
  ): Promise<{ uploadUrl: string; fileId: string; downloadUrl: string }> {
    this.logger.log(`Generating signed URL for user: ${userId}`);

    try {
      const bucketName = this.minioService.getBucketForFileType(signedUrlData.mime_type);
      const objectName = this.minioService.generateObjectName(signedUrlData.file_name, userId);
      
      // Create file record in database
      const fileEntity = this.fileRepository.create({
        user_id: userId,
        file_name: signedUrlData.file_name,
        original_name: signedUrlData.file_name,
        file_type: signedUrlData.file_type as FileType,
        mime_type: signedUrlData.mime_type,
        file_size: signedUrlData.file_size,
        file_url: '', // Will be updated after upload
        bucket_name: bucketName,
        object_key: objectName,
        status: 'uploading' as const,
        is_public: signedUrlData.is_public || false,
      });

      const savedFile = await this.fileRepository.save(fileEntity);

      // Generate presigned upload URL
      const expiresInSeconds = (signedUrlData.expires_in_minutes || 60) * 60;
      const uploadUrl = await this.minioService.generatePresignedUploadUrl(
        bucketName,
        objectName,
        expiresInSeconds,
      );

      // Generate download URL
      const downloadUrl = await this.minioService.getFileUrl(bucketName, objectName);

      this.logger.log(`Signed URL generated successfully: ${savedFile.id}`);
      
      return {
        uploadUrl,
        fileId: savedFile.id,
        downloadUrl,
      };
    } catch (error) {
      this.logger.error(`Failed to generate signed URL:`, error);
      throw new BadRequestException('Failed to generate signed URL');
    }
  }

  /**
   * Get file by ID
   */
  async getFile(fileId: string, userId?: string): Promise<File> {
    this.logger.log(`Getting file: ${fileId}`);

    const whereCondition: any = { id: fileId };
    if (userId) {
      whereCondition.user_id = userId;
    }

    const file = await this.fileRepository.findOne({
      where: whereCondition,
    });

    if (!file) {
      throw new NotFoundException('File not found');
    }

    return file;
  }

  /**
   * Get file download URL
   */
  async getFileDownloadUrl(fileId: string, userId?: string): Promise<string> {
    const file = await this.getFile(fileId, userId);
    
    if (file.is_public) {
      return file.file_url;
    }

    // Generate presigned URL for other private files
    const expiresInSeconds = 3600; // 1 hour
    return await this.minioService.generatePresignedDownloadUrl(
      file.bucket_name,
      file.object_key,
      expiresInSeconds,
    );
  }

  /**
   * Get file stream for direct serving
   */
  async getFileStream(fileId: string, userId?: string): Promise<{ stream: any; file: any }> {
    const file = await this.getFile(fileId, userId);
    
    const stream = await this.minioService.getFileStream(file.bucket_name, file.object_key);
    
    return { stream, file };
  }

  /**
   * Delete file
   */
  async deleteFile(fileId: string, userId: string): Promise<void> {
    this.logger.log(`Deleting file: ${fileId}`);

    const file = await this.getFile(fileId, userId);

    try {
      // Delete from MinIO
      await this.minioService.deleteFile(file.bucket_name, file.object_key);
      
      // Delete thumbnail if exists
      if (file.thumbnail_url) {
        const thumbnailObjectName = `thumbnails/${file.object_key}`;
        await this.minioService.deleteFile(file.bucket_name, thumbnailObjectName);
      }

      // Update status in database
      await this.fileRepository.update(fileId, { status: 'deleted' });
      
      this.logger.log(`File deleted successfully: ${fileId}`);
    } catch (error) {
      this.logger.error(`Failed to delete file:`, error);
      throw new BadRequestException('Failed to delete file');
    }
  }

  /**
   * List user files
   */
  async listUserFiles(
    userId: string,
    fileType?: string,
    page: number = 1,
    limit: number = 10,
  ): Promise<{ files: File[]; total: number }> {
    this.logger.log(`Listing files for user: ${userId}`);

    const whereCondition: any = { user_id: userId, status: 'ready' };
    if (fileType) {
      whereCondition.file_type = fileType;
    }

    const [files, total] = await this.fileRepository.findAndCount({
      where: whereCondition,
      order: { created_at: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { files, total };
  }

  /**
   * Update file metadata
   */
  async updateFileMetadata(
    fileId: string,
    userId: string,
    metadata: Record<string, any>,
  ): Promise<File> {
    this.logger.log(`Updating file metadata: ${fileId}`);

    const file = await this.getFile(fileId, userId);
    
    await this.fileRepository.update(fileId, { metadata });
    
    return this.getFile(fileId, userId);
  }

  /**
   * Mark file as processed
   */
  async markFileAsProcessed(fileId: string, fileUrl: string): Promise<void> {
    this.logger.log(`Marking file as processed: ${fileId}`);

    await this.fileRepository.update(fileId, {
      status: 'ready',
      file_url: fileUrl,
    });
  }

  /**
   * Get file type from MIME type
   */
  private getFileTypeFromMime(mimeType: string): FileType {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType.includes('pdf') || mimeType.includes('document')) return 'document';
    if (mimeType.includes('slide') || mimeType.includes('presentation')) return 'slide';
    return 'other';
  }

  /**
   * Get storage statistics
   */
  async getStorageStats(userId: string): Promise<{
    totalFiles: number;
    totalSize: number;
    filesByType: Record<string, number>;
  }> {
    this.logger.log(`Getting storage stats for user: ${userId}`);

    const files = await this.fileRepository.find({
      where: { user_id: userId, status: 'ready' },
    });

    const totalFiles = files.length;
    const totalSize = files.reduce((sum, file) => sum + file.file_size, 0);
    const filesByType = files.reduce((acc, file) => {
      acc[file.file_type] = (acc[file.file_type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalFiles,
      totalSize,
      filesByType,
    };
  }
}
