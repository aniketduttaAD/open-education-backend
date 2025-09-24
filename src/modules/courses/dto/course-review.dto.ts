import { IsString, IsOptional, IsInt, IsBoolean, IsObject, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCourseReviewDto {
  @ApiProperty({ description: 'Course ID' })
  @IsString()
  course_id!: string;

  @ApiProperty({ description: 'Rating (1-5)', minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @ApiPropertyOptional({ description: 'Review comment' })
  @IsOptional()
  @IsString()
  comment?: string;

  @ApiPropertyOptional({ description: 'Is public review', default: true })
  @IsOptional()
  @IsBoolean()
  is_public?: boolean;

  @ApiPropertyOptional({ description: 'Review metadata' })
  @IsOptional()
  @IsObject()
  metadata?: {
    pros?: string[];
    cons?: string[];
    would_recommend?: boolean;
    difficulty_rating?: number;
    content_quality?: number;
    instructor_rating?: number;
  };
}

export class UpdateCourseReviewDto {
  @ApiPropertyOptional({ description: 'Rating (1-5)', minimum: 1, maximum: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @ApiPropertyOptional({ description: 'Review comment' })
  @IsOptional()
  @IsString()
  comment?: string;

  @ApiPropertyOptional({ description: 'Is public review' })
  @IsOptional()
  @IsBoolean()
  is_public?: boolean;

  @ApiPropertyOptional({ description: 'Review metadata' })
  @IsOptional()
  @IsObject()
  metadata?: {
    pros?: string[];
    cons?: string[];
    would_recommend?: boolean;
    difficulty_rating?: number;
    content_quality?: number;
    instructor_rating?: number;
  };
}

export class CreateReviewReplyDto {
  @ApiProperty({ description: 'Review ID' })
  @IsString()
  review_id!: string;

  @ApiProperty({ description: 'Reply content' })
  @IsString()
  content!: string;

  @ApiPropertyOptional({ description: 'Is public reply', default: true })
  @IsOptional()
  @IsBoolean()
  is_public?: boolean;
}

export class VoteReviewDto {
  @ApiProperty({ description: 'Review ID' })
  @IsString()
  review_id!: string;

  @ApiProperty({ description: 'Is helpful vote', default: true })
  @IsBoolean()
  is_helpful!: boolean;
}
