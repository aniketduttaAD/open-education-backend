import { IsString, IsNumber, Min, IsEnum, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SubtopicType } from '../entities/course-subtopic.entity';

export class CreateSubtopicDto {
  @ApiProperty({ description: 'Subtopic title' })
  @IsString()
  title!: string;

  @ApiProperty({ description: 'Subtopic content' })
  @IsString()
  content!: string;

  @ApiProperty({ description: 'Subtopic type', enum: ['video', 'text', 'quiz', 'assignment', 'resource'] })
  @IsEnum(['video', 'text', 'quiz', 'assignment', 'resource'])
  type!: SubtopicType;

  @ApiProperty({ description: 'Order index of the subtopic' })
  @IsNumber()
  @Min(1)
  order_index!: number;

  @ApiPropertyOptional({ description: 'Subtopic duration in minutes' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  duration_minutes?: number;

  @ApiPropertyOptional({ description: 'Video URL for video subtopics' })
  @IsOptional()
  @IsString()
  video_url?: string;

  @ApiPropertyOptional({ description: 'Resource URL for resource subtopics' })
  @IsOptional()
  @IsString()
  resource_url?: string;

  @ApiPropertyOptional({ description: 'Quiz data for quiz subtopics' })
  @IsOptional()
  quiz_data?: Record<string, any>;

  @ApiPropertyOptional({ description: 'Whether this subtopic is required' })
  @IsOptional()
  @IsBoolean()
  is_required?: boolean;
}
