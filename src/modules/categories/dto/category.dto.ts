import { IsString, IsOptional, IsBoolean, IsInt, IsUUID, IsObject, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCategoryDto {
  @ApiProperty({ description: 'Category name' })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ description: 'Category description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Category image URL' })
  @IsOptional()
  @IsString()
  image_url?: string;

  @ApiPropertyOptional({ description: 'Category color' })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional({ description: 'Category icon' })
  @IsOptional()
  @IsString()
  icon?: string;

  @ApiPropertyOptional({ description: 'Parent category ID' })
  @IsOptional()
  @IsUUID()
  parent_id?: string;

  @ApiPropertyOptional({ description: 'Order index', minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  order_index?: number;

  @ApiPropertyOptional({ description: 'Category metadata' })
  @IsOptional()
  @IsObject()
  metadata?: {
    keywords?: string[];
    seo_title?: string;
    seo_description?: string;
    custom_fields?: Record<string, any>;
  };
}

export class UpdateCategoryDto {
  @ApiPropertyOptional({ description: 'Category name' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Category description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Category image URL' })
  @IsOptional()
  @IsString()
  image_url?: string;

  @ApiPropertyOptional({ description: 'Category color' })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional({ description: 'Category icon' })
  @IsOptional()
  @IsString()
  icon?: string;

  @ApiPropertyOptional({ description: 'Parent category ID' })
  @IsOptional()
  @IsUUID()
  parent_id?: string;

  @ApiPropertyOptional({ description: 'Order index', minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  order_index?: number;

  @ApiPropertyOptional({ description: 'Is active' })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @ApiPropertyOptional({ description: 'Category metadata' })
  @IsOptional()
  @IsObject()
  metadata?: {
    keywords?: string[];
    seo_title?: string;
    seo_description?: string;
    custom_fields?: Record<string, any>;
  };
}

export class AssignCourseCategoryDto {
  @ApiProperty({ description: 'Course ID' })
  @IsUUID()
  course_id!: string;

  @ApiProperty({ description: 'Category ID' })
  @IsUUID()
  category_id!: string;

  @ApiPropertyOptional({ description: 'Is primary category', default: false })
  @IsOptional()
  @IsBoolean()
  is_primary?: boolean;

  @ApiPropertyOptional({ description: 'Order index', minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  order_index?: number;
}

export class CategoryResponseDto {
  @ApiProperty({ description: 'Category ID' })
  id!: string;

  @ApiProperty({ description: 'Category name' })
  name!: string;

  @ApiProperty({ description: 'Category description' })
  description?: string;

  @ApiProperty({ description: 'Category image URL' })
  image_url?: string;

  @ApiProperty({ description: 'Category color' })
  color?: string;

  @ApiProperty({ description: 'Category icon' })
  icon?: string;

  @ApiProperty({ description: 'Parent category ID' })
  parent_id?: string;

  @ApiProperty({ description: 'Category level' })
  level!: number;

  @ApiProperty({ description: 'Order index' })
  order_index!: number;

  @ApiProperty({ description: 'Is active' })
  is_active!: boolean;

  @ApiProperty({ description: 'Created at timestamp' })
  created_at!: Date;

  @ApiProperty({ description: 'Updated at timestamp' })
  updated_at!: Date;
}
