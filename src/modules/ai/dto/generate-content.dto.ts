import { IsString, IsOptional, IsEnum, IsNumber, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GenerateRoadmapDto {
  @ApiProperty({ description: 'Course title' })
  @IsString()
  title!: string;

  @ApiProperty({ description: 'Course description' })
  @IsString()
  description!: string;

  @ApiPropertyOptional({ description: 'Course level', enum: ['beginner', 'intermediate', 'advanced'] })
  @IsOptional()
  @IsEnum(['beginner', 'intermediate', 'advanced'])
  level?: string;
}

export class GenerateTopicContentDto {
  @ApiProperty({ description: 'Topic title' })
  @IsString()
  title!: string;

  @ApiProperty({ description: 'Topic description' })
  @IsString()
  description!: string;

  @ApiProperty({ description: 'Course context' })
  @IsString()
  course_context!: string;
}

export class GenerateQuizDto {
  @ApiProperty({ description: 'Topic title' })
  @IsString()
  topic_title!: string;

  @ApiProperty({ description: 'Content to generate quiz from' })
  @IsString()
  content!: string;

  @ApiPropertyOptional({ description: 'Quiz difficulty', enum: ['beginner', 'intermediate', 'advanced'] })
  @IsOptional()
  @IsEnum(['beginner', 'intermediate', 'advanced'])
  difficulty?: string;

  @ApiPropertyOptional({ description: 'Number of questions', minimum: 1, maximum: 20 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(20)
  question_count?: number;
}
