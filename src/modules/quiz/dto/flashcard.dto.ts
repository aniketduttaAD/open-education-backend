import { IsString, IsOptional, IsEnum, IsInt, IsBoolean, IsObject, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateFlashcardDto {
  @ApiProperty({ description: 'Subtopic ID for the flashcard' })
  @IsString()
  subtopic_id!: string;

  @ApiProperty({ description: 'Flashcard title' })
  @IsString()
  title!: string;

  @ApiProperty({ description: 'Front content of the flashcard' })
  @IsString()
  front_content!: string;

  @ApiProperty({ description: 'Back content of the flashcard' })
  @IsString()
  back_content!: string;

  @ApiPropertyOptional({ 
    description: 'Flashcard type',
    enum: ['basic', 'cloze', 'image', 'audio'],
    default: 'basic'
  })
  @IsOptional()
  @IsEnum(['basic', 'cloze', 'image', 'audio'])
  type?: 'basic' | 'cloze' | 'image' | 'audio';

  @ApiPropertyOptional({ description: 'Difficulty level (1-5)', minimum: 1, maximum: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  difficulty_level?: number;

  @ApiPropertyOptional({ description: 'Flashcard metadata' })
  @IsOptional()
  @IsObject()
  metadata?: {
    tags?: string[];
    image_url?: string;
    audio_url?: string;
    hints?: string[];
  };
}

export class ReviewFlashcardDto {
  @ApiProperty({ description: 'Flashcard ID' })
  @IsString()
  flashcard_id!: string;

  @ApiProperty({ description: 'Review quality (1-5)', minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  quality!: number;

  @ApiPropertyOptional({ description: 'Time spent reviewing in seconds' })
  @IsOptional()
  @IsInt()
  @Min(0)
  time_spent_seconds?: number;
}
