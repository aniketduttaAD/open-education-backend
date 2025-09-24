import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Minio from 'minio';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import { MINIO_BUCKETS } from '../../../config/minio.config';

/**
 * MinIO service for S3-compatible file storage operations
 */
@Injectable()
export class MinioService {
  private readonly logger = new Logger(MinioService.name);
  private readonly minioClient: Minio.Client;
  private readonly buckets: string[];

  constructor(private configService: ConfigService) {
    this.minioClient = new Minio.Client({
      endPoint: 'minio', // Docker service name
      port: 9000, // Hardcoded
      useSSL: false, // Hardcoded
      accessKey: this.configService.get<string>('MINIO_ACCESS_KEY', 'minioadmin'),
      secretKey: this.configService.get<string>('MINIO_SECRET_KEY', 'minioadmin'),
    });

    this.buckets = Object.values(MINIO_BUCKETS);
    this.initializeBuckets();
  }

  /**
   * Initialize all required buckets
   */
  private async initializeBuckets(): Promise<void> {
    this.logger.log('Initializing MinIO buckets...');

    for (const bucket of this.buckets) {
      try {
        const exists = await this.minioClient.bucketExists(bucket);
        if (!exists) {
          await this.minioClient.makeBucket(bucket, 'us-east-1');
          this.logger.log(`Created bucket: ${bucket}`);
        }
      } catch (error) {
        this.logger.error(`Failed to create bucket ${bucket}:`, error);
      }
    }
  }

  /**
   * Generate presigned URL for file upload
   */
  async generatePresignedUploadUrl(
    bucketName: string,
    objectName: string,
    expiresInSeconds: number = 3600,
  ): Promise<string> {
    try {
      const url = await this.minioClient.presignedPutObject(bucketName, objectName, expiresInSeconds);
      this.logger.log(`Generated presigned upload URL for ${bucketName}/${objectName}`);
      return url;
    } catch (error) {
      this.logger.error(`Failed to generate presigned upload URL:`, error);
      throw new BadRequestException('Failed to generate upload URL');
    }
  }

  /**
   * Generate presigned URL for file download
   */
  async generatePresignedDownloadUrl(
    bucketName: string,
    objectName: string,
    expiresInSeconds: number = 3600,
  ): Promise<string> {
    try {
      const url = await this.minioClient.presignedGetObject(bucketName, objectName, expiresInSeconds);
      this.logger.log(`Generated presigned download URL for ${bucketName}/${objectName}`);
      return url;
    } catch (error) {
      this.logger.error(`Failed to generate presigned download URL:`, error);
      throw new BadRequestException('Failed to generate download URL');
    }
  }

  /**
   * Upload file to MinIO
   */
  async uploadFile(
    bucketName: string,
    objectName: string,
    fileBuffer: Buffer,
    contentType: string,
  ): Promise<string> {
    try {
      await this.minioClient.putObject(bucketName, objectName, fileBuffer, {
        'Content-Type': contentType,
      });

      const fileUrl = await this.getFileUrl(bucketName, objectName);
      this.logger.log(`File uploaded successfully: ${fileUrl}`);
      return fileUrl;
    } catch (error) {
      this.logger.error(`Failed to upload file:`, error);
      throw new BadRequestException('Failed to upload file');
    }
  }

  /**
   * Delete file from MinIO
   */
  async deleteFile(bucketName: string, objectName: string): Promise<void> {
    try {
      await this.minioClient.removeObject(bucketName, objectName);
      this.logger.log(`File deleted successfully: ${bucketName}/${objectName}`);
    } catch (error) {
      this.logger.error(`Failed to delete file:`, error);
      throw new BadRequestException('Failed to delete file');
    }
  }

  /**
   * Get file URL
   */
  async getFileUrl(bucketName: string, objectName: string): Promise<string> {
    const endpoint = 'minio'; // Docker service name
    const port = 9000; // Hardcoded
    const useSSL = false; // Hardcoded
    
    const protocol = useSSL ? 'https' : 'http';
    return `${protocol}://${endpoint}:${port}/${bucketName}/${objectName}`;
  }

  /**
   * Check if file exists
   */
  async fileExists(bucketName: string, objectName: string): Promise<boolean> {
    try {
      await this.minioClient.statObject(bucketName, objectName);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get file metadata
   */
  async getFileMetadata(bucketName: string, objectName: string): Promise<any> {
    try {
      const stat = await this.minioClient.statObject(bucketName, objectName);
      return stat;
    } catch (error) {
      this.logger.error(`Failed to get file metadata:`, error);
      throw new BadRequestException('Failed to get file metadata');
    }
  }

  /**
   * Process and resize image
   */
  async processImage(
    fileBuffer: Buffer,
    options: {
      width?: number;
      height?: number;
      quality?: number;
      format?: 'jpeg' | 'png' | 'webp';
    } = {},
  ): Promise<Buffer> {
    try {
      let sharpInstance = sharp(fileBuffer);

      if (options.width || options.height) {
        sharpInstance = sharpInstance.resize(options.width, options.height, {
          fit: 'inside',
          withoutEnlargement: true,
        });
      }

      if (options.format) {
        switch (options.format) {
          case 'jpeg':
            sharpInstance = sharpInstance.jpeg({ quality: options.quality || 80 });
            break;
          case 'png':
            sharpInstance = sharpInstance.png({ quality: options.quality || 80 });
            break;
          case 'webp':
            sharpInstance = sharpInstance.webp({ quality: options.quality || 80 });
            break;
        }
      }

      return await sharpInstance.toBuffer();
    } catch (error) {
      this.logger.error(`Failed to process image:`, error);
      throw new BadRequestException('Failed to process image');
    }
  }

  /**
   * Generate thumbnail for image
   */
  async generateThumbnail(fileBuffer: Buffer, size: number = 300): Promise<Buffer> {
    try {
      return await sharp(fileBuffer)
        .resize(size, size, {
          fit: 'cover',
          position: 'center',
        })
        .jpeg({ quality: 80 })
        .toBuffer();
    } catch (error) {
      this.logger.error(`Failed to generate thumbnail:`, error);
      throw new BadRequestException('Failed to generate thumbnail');
    }
  }

  /**
   * Get appropriate bucket for file type
   */
  getBucketForFileType(fileType: string): string {
    const mimeType = fileType.toLowerCase();
    
    if (mimeType.startsWith('image/')) {
      return MINIO_BUCKETS.PROFILES;
    } else if (mimeType.startsWith('video/')) {
      return MINIO_BUCKETS.COURSES;
    } else if (mimeType.startsWith('audio/')) {
      return MINIO_BUCKETS.AUDIO;
    } else if (mimeType.includes('pdf') || mimeType.includes('document')) {
      return MINIO_BUCKETS.DOCUMENTS;
    } else if (mimeType.includes('slide') || mimeType.includes('presentation')) {
      return MINIO_BUCKETS.SLIDES;
    } else {
      return MINIO_BUCKETS.DOCUMENTS;
    }
  }

  /**
   * Generate unique object name
   */
  generateObjectName(originalName: string, userId: string): string {
    const timestamp = Date.now();
    const uuid = uuidv4();
    const extension = originalName.split('.').pop();
    return `${userId}/${timestamp}-${uuid}.${extension}`;
  }

  /**
   * List files in bucket
   */
  async listFiles(bucketName: string, prefix?: string): Promise<any[]> {
    try {
      const objects: any[] = [];
      const stream = this.minioClient.listObjects(bucketName, prefix, true);
      
      return new Promise((resolve, reject) => {
        stream.on('data', (obj) => objects.push(obj));
        stream.on('end', () => resolve(objects));
        stream.on('error', (err) => reject(err));
      });
    } catch (error) {
      this.logger.error(`Failed to list files:`, error);
      throw new BadRequestException('Failed to list files');
    }
  }

  /**
   * Health check for MinIO service
   */
  async healthCheck(): Promise<void> {
    try {
      // Try to list buckets to verify connection
      await this.minioClient.listBuckets();
      this.logger.log('MinIO health check passed');
    } catch (error) {
      this.logger.error('MinIO health check failed:', error);
      throw new BadRequestException('MinIO service is not accessible');
    }
  }
}
