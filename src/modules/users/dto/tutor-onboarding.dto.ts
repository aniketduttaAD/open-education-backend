import { IsString, IsOptional, IsEnum, IsArray, IsNumber, Min, Max, IsEmail, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum TeachingExperience {
  BEGINNER = 'beginner',
  INTERMEDIATE = 'intermediate',
  ADVANCED = 'advanced',
  EXPERT = 'expert',
}

export class TutorOnboardingDto {
  @ApiProperty({ description: 'Tutor full name' })
  @IsString()
  name!: string;

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

  @ApiPropertyOptional({ description: 'Bank account number' })
  @IsOptional()
  @IsString()
  bank_account_number?: string;

  @ApiPropertyOptional({ description: 'IFSC code' })
  @IsOptional()
  @IsString()
  ifsc_code?: string;

  @ApiPropertyOptional({ description: 'Bank name' })
  @IsOptional()
  @IsString()
  bank_name?: string;

  @ApiPropertyOptional({ description: 'Account holder name' })
  @IsOptional()
  @IsString()
  account_holder_name?: string;

  @ApiPropertyOptional({ description: 'Available for live sessions' })
  @IsOptional()
  @IsBoolean()
  is_available_for_live_sessions?: boolean;
}
