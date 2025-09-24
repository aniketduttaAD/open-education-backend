import { IsString, IsOptional, IsBoolean, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FileType } from '../entities/file.entity';

export class UploadFileDto {
  @ApiPropertyOptional({ description: 'File type category', enum: ['image', 'video', 'audio', 'document', 'slide', 'certificate', 'other'] })
  @IsOptional()
  @IsEnum(['image', 'video', 'audio', 'document', 'slide', 'certificate', 'other'])
  file_type?: FileType;

  @ApiPropertyOptional({ description: 'Whether the file should be publicly accessible' })
  @IsOptional()
  @IsBoolean()
  is_public?: boolean;

  @ApiPropertyOptional({ description: 'Additional metadata for the file' })
  @IsOptional()
  @IsString()
  metadata?: string;

  @ApiPropertyOptional({ description: 'Expiration date for the file (ISO string)' })
  @IsOptional()
  @IsString()
  expires_at?: string;
}
