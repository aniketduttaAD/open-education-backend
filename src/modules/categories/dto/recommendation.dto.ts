import { IsString, IsOptional, IsEnum, IsUUID, IsObject, IsBoolean, IsInt, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GenerateRecommendationsDto {
  @ApiProperty({ description: 'User ID' })
  @IsUUID()
  user_id!: string;

  @ApiPropertyOptional({ 
    description: 'Recommendation type',
    enum: ['similar_courses', 'trending', 'personalized', 'category_based', 'collaborative_filtering'],
    default: 'personalized'
  })
  @IsOptional()
  @IsEnum(['similar_courses', 'trending', 'personalized', 'category_based', 'collaborative_filtering'])
  type?: 'similar_courses' | 'trending' | 'personalized' | 'category_based' | 'collaborative_filtering';

  @ApiPropertyOptional({ description: 'Number of recommendations', minimum: 1, maximum: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @ApiPropertyOptional({ description: 'Category ID to filter by' })
  @IsOptional()
  @IsUUID()
  category_id?: string;
}

export class TrackRecommendationClickDto {
  @ApiProperty({ description: 'Recommendation ID' })
  @IsUUID()
  recommendation_id!: string;

  @ApiPropertyOptional({ description: 'Click position' })
  @IsOptional()
  @IsInt()
  @Min(1)
  position?: number;
}

export class RecommendationResponseDto {
  @ApiProperty({ description: 'Recommendation ID' })
  id!: string;

  @ApiProperty({ description: 'User ID' })
  user_id!: string;

  @ApiProperty({ description: 'Course ID' })
  course_id!: string;

  @ApiProperty({ description: 'Recommendation type' })
  type!: string;

  @ApiProperty({ description: 'Recommendation status' })
  status!: string;

  @ApiProperty({ description: 'Recommendation score' })
  score!: number;

  @ApiProperty({ description: 'Recommendation position' })
  position!: number;

  @ApiProperty({ description: 'Recommendation reason' })
  reason?: string;

  @ApiProperty({ description: 'Is clicked' })
  is_clicked!: boolean;

  @ApiProperty({ description: 'Clicked at timestamp' })
  clicked_at?: Date;

  @ApiProperty({ description: 'Created at timestamp' })
  created_at!: Date;
}
