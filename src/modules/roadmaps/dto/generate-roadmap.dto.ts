import { IsArray, IsEnum, IsNumber, IsObject, IsOptional, IsString, Max, Min } from 'class-validator';

export class GenerateRoadmapDto {
  @IsString()
  prompt!: string;

  @IsOptional()
  @IsEnum(['beginner', 'intermediate', 'advanced'] as any)
  level?: 'beginner' | 'intermediate' | 'advanced';

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(104)
  durationWeeks?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(80)
  weeklyCommitmentHours?: number;

  @IsOptional()
  @IsObject()
  techStackPrefs?: Record<string, any>;

  @IsOptional()
  @IsArray()
  constraints?: string[];

  @IsOptional()
  @IsEnum(['json', 'markdown', 'both'] as any)
  outputFormat?: 'json' | 'markdown' | 'both';
}


