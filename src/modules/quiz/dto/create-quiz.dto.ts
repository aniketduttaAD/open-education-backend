import { IsString, IsOptional, IsEnum, IsInt, IsBoolean, IsArray, IsObject, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateQuizDto {
  @ApiProperty({ description: 'Topic ID for the quiz' })
  @IsString()
  topic_id!: string;

  @ApiProperty({ description: 'Quiz title' })
  @IsString()
  title!: string;

  @ApiPropertyOptional({ description: 'Quiz description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ 
    description: 'Quiz type',
    enum: ['multiple_choice', 'true_false', 'short_answer', 'essay'],
    default: 'multiple_choice'
  })
  @IsOptional()
  @IsEnum(['multiple_choice', 'true_false', 'short_answer', 'essay'])
  type?: 'multiple_choice' | 'true_false' | 'short_answer' | 'essay';

  @ApiPropertyOptional({ 
    description: 'Quiz difficulty',
    enum: ['beginner', 'intermediate', 'advanced'],
    default: 'intermediate'
  })
  @IsOptional()
  @IsEnum(['beginner', 'intermediate', 'advanced'])
  difficulty?: 'beginner' | 'intermediate' | 'advanced';

  @ApiPropertyOptional({ description: 'Time limit in minutes', minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  time_limit_minutes?: number;

  @ApiPropertyOptional({ description: 'Passing score percentage', minimum: 0, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  passing_score?: number;

  @ApiPropertyOptional({ description: 'Maximum attempts allowed', minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  max_attempts?: number;

  @ApiPropertyOptional({ description: 'Quiz questions array' })
  @IsOptional()
  @IsArray()
  questions?: Array<{
    id: string;
    question: string;
    type: 'multiple_choice' | 'true_false' | 'short_answer' | 'essay';
    options?: string[];
    correct_answer: string | string[];
    explanation?: string;
    points: number;
  }>;

  @ApiPropertyOptional({ description: 'Quiz metadata' })
  @IsOptional()
  @IsObject()
  metadata?: {
    tags?: string[];
    learning_objectives?: string[];
    prerequisites?: string[];
  };
}
