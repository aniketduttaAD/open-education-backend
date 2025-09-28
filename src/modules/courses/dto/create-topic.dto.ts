import { IsString, IsNumber, Min, IsArray, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTopicDto {
  @ApiProperty({ description: 'Section title' })
  @IsString()
  title!: string;

  @ApiProperty({ description: 'Order index of the section' })
  @IsNumber()
  @Min(1)
  index!: number;
}
