import { IsString, IsOptional, IsEmail, IsNumber, Min, Max, IsArray } from 'class-validator';

export class UpdateProfileDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  image?: string;
}

export class UpdateStudentProfileDto extends UpdateProfileDto {
  @IsNumber()
  @IsOptional()
  @Min(13)
  @Max(100)
  age?: number;

  @IsString()
  @IsOptional()
  gender?: string;

  @IsString()
  @IsOptional()
  latest_degree?: string;

  @IsString()
  @IsOptional()
  college_university?: string;

  @IsString()
  @IsOptional()
  profile_image_url?: string;

  @IsArray()
  @IsOptional()
  preferred_languages?: string[];

  @IsString()
  @IsOptional()
  learning_goals?: string;

  @IsString()
  @IsOptional()
  timezone?: string;
}

export class UpdateTutorProfileDto extends UpdateProfileDto {
  @IsString()
  @IsOptional()
  bio?: string;

  @IsString()
  @IsOptional()
  profile_image_url?: string;

  @IsString()
  @IsOptional()
  specialization?: string;

  @IsNumber()
  @IsOptional()
  years_of_experience?: number;

  @IsNumber()
  @IsOptional()
  hourly_rate?: number;

  @IsString()
  @IsOptional()
  bank_account_number?: string;

  @IsString()
  @IsOptional()
  ifsc_code?: string;
}
