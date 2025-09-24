import { IsString, IsOptional, IsEnum, IsNumber, Min, Max, IsArray, IsDecimal } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CourseLevel } from '../entities/course.entity';

export class CreateCourseDto {
  @ApiProperty({ description: 'Course title' })
  @IsString()
  title!: string;

  @ApiProperty({ description: 'Course description' })
  @IsString()
  description!: string;

  @ApiPropertyOptional({ description: 'Course thumbnail URL' })
  @IsOptional()
  @IsString()
  thumbnail_url?: string;

  @ApiPropertyOptional({ description: 'Course level', enum: ['beginner', 'intermediate', 'advanced'] })
  @IsOptional()
  @IsEnum(['beginner', 'intermediate', 'advanced'])
  level?: CourseLevel;

  @ApiProperty({ description: 'Course price in INR', minimum: 500, maximum: 1000 })
  @IsNumber()
  @Min(500)
  @Max(1000)
  price!: number;

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
