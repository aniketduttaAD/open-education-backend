import { IsString, IsNumber, Min, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSubtopicDto {
  @ApiProperty({ description: 'Subtopic title' })
  @IsString()
  title!: string;

  @ApiProperty({ description: 'Order index of the subtopic' })
  @IsNumber()
  @Min(1)
  index!: number;

  @ApiPropertyOptional({ description: 'Markdown path' })
  @IsOptional()
  @IsString()
  markdown_path?: string;

  @ApiPropertyOptional({ description: 'Transcript path' })
  @IsOptional()
  @IsString()
  transcript_path?: string;

  @ApiPropertyOptional({ description: 'Audio path' })
  @IsOptional()
  @IsString()
  audio_path?: string;

  @ApiPropertyOptional({ description: 'Video URL' })
  @IsOptional()
  @IsString()
  video_url?: string;

  @ApiPropertyOptional({ description: 'Status' })
  @IsOptional()
  @IsString()
  status?: string;
}
