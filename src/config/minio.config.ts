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

  if (!accessKey || !secretKey) {
    throw new Error('MINIO_ROOT_USER and MINIO_ROOT_PASSWORD are required');
  }

  return {
    endPoint: 'minio', // Docker service name
    port: 9000, 
    useSSL: false, 
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
