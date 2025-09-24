import { IsString, IsOptional, IsDateString, IsEnum, IsArray, IsNumber, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum Gender {
  MALE = 'male',
  FEMALE = 'female',
  OTHER = 'other',
  PREFER_NOT_TO_SAY = 'prefer_not_to_say',
}

export enum EducationLevel {
  HIGH_SCHOOL = 'high_school',
  BACHELORS = 'bachelors',
  MASTERS = 'masters',
  DOCTORATE = 'doctorate',
  PROFESSIONAL = 'professional',
  OTHER = 'other',
}

export class StudentOnboardingDto {
  @ApiProperty({ description: 'Student full name' })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ description: 'Student age' })
  @IsOptional()
  @IsNumber()
  @Min(13)
  @Max(100)
  age?: number;

  @ApiPropertyOptional({ description: 'Student gender', enum: Gender })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiPropertyOptional({ description: 'Student bio/description' })
  @IsOptional()
  @IsString()
  bio?: string;

  @ApiPropertyOptional({ description: 'Educational background' })
  @IsOptional()
  @IsString()
  educational_background?: string;

  @ApiPropertyOptional({ description: 'Education level', enum: EducationLevel })
  @IsOptional()
  @IsEnum(EducationLevel)
  education_level?: EducationLevel;

  @ApiPropertyOptional({ description: 'College or university name' })
  @IsOptional()
  @IsString()
  college_university?: string;

  @ApiPropertyOptional({ description: 'Learning goals and interests' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  learning_goals?: string[];

  @ApiPropertyOptional({ description: 'Preferred learning languages' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  preferred_languages?: string[];

  @ApiPropertyOptional({ description: 'Profile image URL' })
  @IsOptional()
  @IsString()
  profile_image_url?: string;
}
