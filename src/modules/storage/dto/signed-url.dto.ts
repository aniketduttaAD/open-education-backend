import { IsString, IsOptional, IsEnum, IsNumber, Min, Max, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FileType } from '../entities/file.entity';

export class GenerateSignedUrlDto {
  @ApiProperty({ description: 'File name' })
  @IsString()
  file_name!: string;

  @ApiProperty({ description: 'File type category', enum: ['image', 'video', 'audio', 'document', 'slide', 'certificate', 'other'] })
  @IsEnum(['image', 'video', 'audio', 'document', 'slide', 'certificate', 'other'])
  file_type!: FileType;

  @ApiProperty({ description: 'MIME type of the file' })
  @IsString()
  mime_type!: string;

  @ApiProperty({ description: 'File size in bytes' })
  @IsNumber()
  @Min(1)
  file_size!: number;

  @ApiPropertyOptional({ description: 'Whether the file should be publicly accessible' })
  @IsOptional()
  @IsBoolean()
  is_public?: boolean;

  @ApiPropertyOptional({ description: 'Expiration time in minutes (1-60)', minimum: 1, maximum: 60 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(60)
  expires_in_minutes?: number;
}
