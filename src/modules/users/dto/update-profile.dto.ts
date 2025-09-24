import { IsString, IsOptional, IsEnum, IsArray, IsNumber, Min, Max, IsBoolean } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Gender, EducationLevel } from './student-onboarding.dto';
import { TeachingExperience } from './tutor-onboarding.dto';

export class UpdateStudentProfileDto {
  @ApiPropertyOptional({ description: 'Student full name' })
  @IsOptional()
  @IsString()
  name?: string;

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

export class UpdateTutorProfileDto {
  @ApiPropertyOptional({ description: 'Tutor full name' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Tutor bio/description' })
  @IsOptional()
  @IsString()
  bio?: string;

  @ApiPropertyOptional({ description: 'Professional title or designation' })
  @IsOptional()
  @IsString()
  professional_title?: string;

  @ApiPropertyOptional({ description: 'Educational qualifications' })
  @IsOptional()
  @IsString()
  qualifications?: string;

  @ApiPropertyOptional({ description: 'Teaching experience level', enum: TeachingExperience })
  @IsOptional()
  @IsEnum(TeachingExperience)
  teaching_experience?: TeachingExperience;

  @ApiPropertyOptional({ description: 'Years of teaching experience' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(50)
  years_of_experience?: number;

  @ApiPropertyOptional({ description: 'Teaching specializations' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  specializations?: string[];

  @ApiPropertyOptional({ description: 'Languages spoken' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  languages_spoken?: string[];

  @ApiPropertyOptional({ description: 'Profile image URL' })
  @IsOptional()
  @IsString()
  profile_image_url?: string;

  @ApiPropertyOptional({ description: 'LinkedIn profile URL' })
  @IsOptional()
  @IsString()
  linkedin_url?: string;

  @ApiPropertyOptional({ description: 'Portfolio or website URL' })
  @IsOptional()
  @IsString()
  portfolio_url?: string;

  @ApiPropertyOptional({ description: 'Available for live sessions' })
  @IsOptional()
  @IsBoolean()
  is_available_for_live_sessions?: boolean;
}
