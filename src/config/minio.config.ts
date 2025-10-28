import { ConfigService } from '@nestjs/config';

export interface MinioConfig {
  endPoint: string;
  port: number;
  useSSL: boolean;
  accessKey: string;
  secretKey: string;
  bucketName?: string;
}

export const getMinioConfig = (configService: ConfigService): MinioConfig => {
  const accessKey = configService.get<string>('MINIO_ROOT_USER');
  const secretKey = configService.get<string>('MINIO_ROOT_PASSWORD');
  const endPoint = configService.get<string>('MINIO_ENDPOINT_INTERNAL') || 'localhost';
  const port = configService.get<number>('MINIO_PORT') || 9000;
  const useSSL = configService.get<boolean>('MINIO_USE_SSL') || false;

  if (!accessKey || !secretKey) {
    throw new Error('MINIO_ROOT_USER and MINIO_ROOT_PASSWORD are required');
  }

  // Extract hostname from URL if it's a full URL
  const hostname = endPoint.replace(/^https?:\/\//, '').replace(/:\d+$/, '');

  return {
    endPoint: hostname,
    port, 
    useSSL, 
    accessKey,
    secretKey,
  };
};

export const MINIO_BUCKETS = {
  COURSES: 'courses',
  CERTIFICATES: 'certificates',
  DOCUMENTS: 'documents',
  PROFILES: 'profiles',
  AUDIO: 'audio',
  SLIDES: 'slides',
} as const;

export const getBucketConfig = (bucketName: string) => ({
  bucketName,
  region: 'us-east-1',
  objectLocking: false,
});

export default getMinioConfig;
