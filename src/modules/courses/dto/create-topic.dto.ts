import { IsString, IsNumber, Min, IsArray, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTopicDto {
  @ApiProperty({ description: 'Topic title' })
  @IsString()
  title!: string;

  @ApiProperty({ description: 'Topic description' })
  @IsString()
  description!: string;

  @ApiProperty({ description: 'Order index of the topic' })
  @IsNumber()
  @Min(1)
  order_index!: number;

  @ApiPropertyOptional({ description: 'Topic duration in minutes' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  duration_minutes?: number;

  @ApiPropertyOptional({ description: 'Learning objectives for this topic' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  learning_objectives?: string[];
}
