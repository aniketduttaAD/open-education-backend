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
  const accessKey = configService.get<string>('MINIO_ACCESS_KEY');
  const secretKey = configService.get<string>('MINIO_SECRET_KEY');

  if (!accessKey || !secretKey) {
    throw new Error('MINIO_ACCESS_KEY and MINIO_SECRET_KEY are required');
  }

  return {
    endPoint: 'minio', // Docker service name
    port: 9000, // Hardcoded
    useSSL: false, // Hardcoded
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
