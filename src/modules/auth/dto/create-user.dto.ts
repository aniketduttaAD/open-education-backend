import { IsEmail, IsString, IsOptional, IsEnum, IsDateString, IsObject, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { UserType, GenderType, TutorDetails, StudentDetails } from '../entities/user.entity';

export class TutorDetailsDto {
  @IsOptional()
  register_fees_paid?: boolean;

  @IsOptional()
  @IsString()
  bio?: string;

  @IsOptional()
  @IsString()
  qualifications?: string;

  @IsOptional()
  @IsString()
  teaching_experience?: string;

  @IsOptional()
  specializations?: string[];

  @IsOptional()
  languages_spoken?: string[];

  @IsOptional()
  expertise_areas?: string[];

  @IsOptional()
  @IsEnum(['pending', 'verified', 'rejected'])
  verification_status?: 'pending' | 'verified' | 'rejected';
}

export class StudentDetailsDto {
  @IsOptional()
  @IsString()
  degree?: string;

  @IsOptional()
  @IsString()
  college_name?: string;

  @IsOptional()
  interests?: string[];

  @IsOptional()
  learning_goals?: string[];

  @IsOptional()
  @IsString()
  experience_level?: string;
}

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  image?: string;

  @IsOptional()
  @IsEnum(['male', 'female', 'other'])
  gender?: GenderType;

  @IsOptional()
  @IsString()
  bio?: string;

  @IsOptional()
  @IsDateString()
  dob?: string;

  @IsEnum(['student', 'tutor', 'admin'])
  user_type!: UserType;

  @IsOptional()
  @ValidateNested()
  @Type(() => TutorDetailsDto)
  tutor_details?: TutorDetailsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => StudentDetailsDto)
  student_details?: StudentDetailsDto;
}
