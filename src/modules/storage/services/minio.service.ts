import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CopyConditions } from 'minio';
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
    // Use internal endpoint for client operations (Docker network)
    const internalEndpoint = this.configService.get<string>('MINIO_ENDPOINT_INTERNAL', 'localhost');
    const internalPort = parseInt(this.configService.get<string>('MINIO_PORT', '9000'));
    
    // Extract hostname from URL if it's a full URL
    const hostname = internalEndpoint.replace(/^https?:\/\//, '').replace(/:\d+$/, '');
    
    this.minioClient = new Minio.Client({
      endPoint: hostname, // Always use internal endpoint for client operations
      port: internalPort,
      useSSL: this.configService.get<string>('MINIO_USE_SSL', 'false') === 'true',
      accessKey: this.configService.get<string>('MINIO_ROOT_USER', 'minioadmin'),
      secretKey: this.configService.get<string>('MINIO_ROOT_PASSWORD', 'minioadmin'),
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

        // Set public read policy for courses bucket (videos need to be publicly accessible)
        if (bucket === MINIO_BUCKETS.COURSES) {
          await this.setPublicReadPolicy(bucket);
        }
      } catch (error) {
        this.logger.error(`Failed to create bucket ${bucket}:`, error);
      }
    }
  }

  /**
   * Set public read policy for a bucket
   */
  private async setPublicReadPolicy(bucketName: string): Promise<void> {
    try {
      const policy = {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: '*',
            Action: ['s3:GetObject'],
            Resource: [`arn:aws:s3:::${bucketName}/*`]
          }
        ]
      };

      await this.minioClient.setBucketPolicy(bucketName, JSON.stringify(policy));
      this.logger.log(`Set public read policy for bucket: ${bucketName}`);
    } catch (error) {
      this.logger.warn(`Failed to set public read policy for bucket ${bucketName}:`, error);
      // Don't throw error as this is not critical for basic functionality
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
      // Get external endpoint configuration for presigned URLs
      const externalEndpoint = this.configService.get<string>('MINIO_ENDPOINT_EXTERNAL', 'localhost:9000');
      const useSSL = this.configService.get<string>('MINIO_USE_SSL', 'false') === 'true';
      const protocol = useSSL ? 'https' : 'http';
      
      // Extract hostname from external endpoint
      const externalHostname = externalEndpoint.replace(/^https?:\/\//, '');
      
      // Use the internal client to generate presigned URL
      const url = await this.minioClient.presignedGetObject(bucketName, objectName, expiresInSeconds);
      
      // Replace the internal hostname with external hostname in the URL
      const externalUrl = url.replace(/https?:\/\/[^\/]+/, `${protocol}://${externalHostname}`);
      
      this.logger.log(`Generated presigned download URL for ${bucketName}/${objectName}`);
      return externalUrl;
    } catch (error) {
      this.logger.error(`Failed to generate presigned download URL:`, error);
      throw new BadRequestException('Failed to generate download URL');
    }
  }

  /**
   * Get file stream from MinIO
   */
  async getFileStream(bucketName: string, objectName: string): Promise<any> {
    try {
      const stream = await this.minioClient.getObject(bucketName, objectName);
      this.logger.log(`Retrieved file stream for ${bucketName}/${objectName}`);
      return stream;
    } catch (error) {
      this.logger.error(`Failed to get file stream:`, error);
      throw new BadRequestException('Failed to retrieve file');
    }
  }

  /**
   * Copy object within MinIO (same or different bucket)
   */
  async copyObject(
    sourceBucket: string,
    sourceObject: string,
    destinationBucket: string,
    destinationObject: string,
  ): Promise<void> {
    try {
      const sourcePath = `/${sourceBucket}/${sourceObject}`;
      const conditions = new CopyConditions();
      await this.minioClient.copyObject(
        destinationBucket,
        destinationObject,
        sourcePath,
        conditions,
      );
      this.logger.log(`Copied ${sourceBucket}/${sourceObject} -> ${destinationBucket}/${destinationObject}`);
    } catch (error) {
      this.logger.error(`Failed to copy object:`, error);
      throw new BadRequestException('Failed to copy object');
    }
  }

  /**
   * Move object within MinIO (copy then remove source)
   */
  async moveObject(
    sourceBucket: string,
    sourceObject: string,
    destinationBucket: string,
    destinationObject: string,
  ): Promise<void> {
    await this.copyObject(sourceBucket, sourceObject, destinationBucket, destinationObject);
    try {
      await this.minioClient.removeObject(sourceBucket, sourceObject);
      this.logger.log(`Removed source ${sourceBucket}/${sourceObject} after move`);
    } catch (error) {
      // Non-fatal: destination already copied
      this.logger.warn(`Failed to remove source after copy: ${sourceBucket}/${sourceObject}`);
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
    isPublic: boolean = false,
  ): Promise<string> {
    try {
      const metadata: any = {
        'Content-Type': contentType,
      };

      // Add public access headers for videos
      if (isPublic) {
        metadata['Cache-Control'] = 'public, max-age=31536000';
        metadata['Access-Control-Allow-Origin'] = '*';
      }

      await this.minioClient.putObject(bucketName, objectName, fileBuffer, metadata);

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
    // Use external endpoint for URLs (accessible from outside Docker)
    const externalEndpoint = this.configService.get<string>('MINIO_ENDPOINT_EXTERNAL', 'localhost:9000');
    const useSSL = this.configService.get<string>('MINIO_USE_SSL', 'false') === 'true';
    
    // Extract hostname from external endpoint
    const externalHostname = externalEndpoint.replace(/^https?:\/\//, '');
    const protocol = useSSL ? 'https' : 'http';
    return `${protocol}://${externalHostname}/${bucketName}/${objectName}`;
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
   * Stream object from MinIO. If range is provided, uses partial reads.
   */
  async getObjectStream(
    bucketName: string,
    objectName: string,
    rangeStart?: number,
    rangeEnd?: number,
  ): Promise<NodeJS.ReadableStream> {
    try {
      if (typeof rangeStart === 'number' && typeof rangeEnd === 'number') {
        const length = rangeEnd - rangeStart + 1;
        return await this.minioClient.getPartialObject(bucketName, objectName, rangeStart, length);
      }
      return await this.minioClient.getObject(bucketName, objectName);
    } catch (error) {
      this.logger.error(`Failed to get object stream:`, error);
      throw new BadRequestException('Failed to stream object');
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
