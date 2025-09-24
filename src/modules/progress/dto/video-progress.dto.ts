import { IsString, IsOptional, IsInt, IsEnum, IsNumber, IsArray, IsObject, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class StartVideoProgressDto {
  @ApiProperty({ description: 'Subtopic ID' })
  @IsString()
  subtopic_id!: string;

  @ApiProperty({ description: 'Enrollment ID' })
  @IsString()
  enrollment_id!: string;

  @ApiPropertyOptional({ description: 'Video duration in seconds' })
  @IsOptional()
  @IsInt()
  @Min(1)
  total_duration_seconds?: number;
}

export class UpdateVideoProgressDto {
  @ApiProperty({ description: 'Current time in seconds' })
  @IsInt()
  @Min(0)
  current_time_seconds!: number;

  @ApiPropertyOptional({ description: 'Playback speed', minimum: 0.5, maximum: 2.0 })
  @IsOptional()
  @IsNumber()
  @Min(0.5)
  @Max(2.0)
  playback_speed?: number;

  @ApiPropertyOptional({ description: 'Action performed' })
  @IsOptional()
  @IsEnum(['play', 'pause', 'seek'])
  action?: 'play' | 'pause' | 'seek';
}

export class CompleteVideoProgressDto {
  @ApiProperty({ description: 'Final current time in seconds' })
  @IsInt()
  @Min(0)
  current_time_seconds!: number;

  @ApiPropertyOptional({ description: 'Total watch time in seconds' })
  @IsOptional()
  @IsInt()
  @Min(0)
  total_watch_time_seconds?: number;
}

export class VideoProgressResponseDto {
  @ApiProperty({ description: 'Progress ID' })
  id!: string;

  @ApiProperty({ description: 'Student ID' })
  student_id!: string;

  @ApiProperty({ description: 'Subtopic ID' })
  subtopic_id!: string;

  @ApiProperty({ description: 'Enrollment ID' })
  enrollment_id!: string;

  @ApiProperty({ description: 'Video status' })
  status!: string;

  @ApiProperty({ description: 'Current time in seconds' })
  current_time_seconds!: number;

  @ApiProperty({ description: 'Total duration in seconds' })
  total_duration_seconds!: number;

  @ApiProperty({ description: 'Progress percentage' })
  progress_percentage!: number;

  @ApiProperty({ description: 'Playback speed' })
  playback_speed!: number;

  @ApiProperty({ description: 'Skip attempts' })
  skip_attempts!: number;

  @ApiProperty({ description: 'Started at timestamp' })
  started_at?: Date;

  @ApiProperty({ description: 'Completed at timestamp' })
  completed_at?: Date;

  @ApiProperty({ description: 'Last watched at timestamp' })
  last_watched_at?: Date;

  @ApiProperty({ description: 'Total watch time in seconds' })
  total_watch_time_seconds!: number;
}
