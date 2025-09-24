import { IsString, IsOptional, IsEnum, IsNumber, Min, Max, IsArray } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CourseLevel, CourseStatus } from '../entities/course.entity';

export class UpdateCourseDto {
  @ApiPropertyOptional({ description: 'Course title' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ description: 'Course description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Course thumbnail URL' })
  @IsOptional()
  @IsString()
  thumbnail_url?: string;

  @ApiPropertyOptional({ description: 'Course level', enum: ['beginner', 'intermediate', 'advanced'] })
  @IsOptional()
  @IsEnum(['beginner', 'intermediate', 'advanced'])
  level?: CourseLevel;

  @ApiPropertyOptional({ description: 'Course price in INR', minimum: 500, maximum: 1000 })
  @IsOptional()
  @IsNumber()
  @Min(500)
  @Max(1000)
  price?: number;

  @ApiPropertyOptional({ description: 'Course status', enum: ['draft', 'published', 'archived'] })
  @IsOptional()
  @IsEnum(['draft', 'published', 'archived'])
  status?: CourseStatus;

  @ApiPropertyOptional({ description: 'Course tags' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ description: 'Learning objectives' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  learning_objectives?: string[];

  @ApiPropertyOptional({ description: 'Prerequisites' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  prerequisites?: string[];
}
