import { IsOptional, IsString, IsArray } from 'class-validator';

export class UpdateStudentDetailsDto {
  @IsOptional()
  @IsString()
  degree?: string;

  @IsOptional()
  @IsString()
  college_name?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  interests?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  learning_goals?: string[];

  @IsOptional()
  @IsString()
  experience_level?: string;
}
