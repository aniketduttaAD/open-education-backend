import { IsString, IsUUID, IsOptional, IsNumber, Min, Max, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class PerSectionDto {
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(20)
  quizCount?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(50)
  flashcardCount?: number;
}

export class GenerateAssessmentsDto {
  @IsUUID()
  id!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => PerSectionDto)
  perSection?: PerSectionDto;
}
