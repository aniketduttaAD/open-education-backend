import { IsString, IsOptional, IsInt, IsBoolean, IsNumber, IsDateString, IsObject, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AddToWishlistDto {
  @ApiProperty({ description: 'Course ID' })
  @IsString()
  course_id!: string;

  @ApiPropertyOptional({ description: 'Wishlist name' })
  @IsOptional()
  @IsString()
  list_name?: string;

  @ApiPropertyOptional({ description: 'Priority level (1-5)', minimum: 1, maximum: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  priority?: number;

  @ApiPropertyOptional({ description: 'Enable notifications', default: true })
  @IsOptional()
  @IsBoolean()
  is_notification_enabled?: boolean;

  @ApiPropertyOptional({ description: 'Target price' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  target_price?: number;

  @ApiPropertyOptional({ description: 'Target date (ISO string)' })
  @IsOptional()
  @IsDateString()
  target_date?: string;

  @ApiPropertyOptional({ description: 'Wishlist metadata' })
  @IsOptional()
  @IsObject()
  metadata?: {
    notes?: string;
    tags?: string[];
    reminder_frequency?: 'daily' | 'weekly' | 'monthly';
    price_alert_threshold?: number;
  };
}

export class UpdateWishlistItemDto {
  @ApiPropertyOptional({ description: 'Wishlist name' })
  @IsOptional()
  @IsString()
  list_name?: string;

  @ApiPropertyOptional({ description: 'Priority level (1-5)', minimum: 1, maximum: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  priority?: number;

  @ApiPropertyOptional({ description: 'Enable notifications' })
  @IsOptional()
  @IsBoolean()
  is_notification_enabled?: boolean;

  @ApiPropertyOptional({ description: 'Target price' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  target_price?: number;

  @ApiPropertyOptional({ description: 'Target date (ISO string)' })
  @IsOptional()
  @IsDateString()
  target_date?: string;

  @ApiPropertyOptional({ description: 'Wishlist metadata' })
  @IsOptional()
  @IsObject()
  metadata?: {
    notes?: string;
    tags?: string[];
    reminder_frequency?: 'daily' | 'weekly' | 'monthly';
    price_alert_threshold?: number;
  };
}

export class WishlistResponseDto {
  @ApiProperty({ description: 'Wishlist ID' })
  id!: string;

  @ApiProperty({ description: 'Student ID' })
  student_id!: string;

  @ApiProperty({ description: 'Course ID' })
  course_id!: string;

  @ApiProperty({ description: 'Wishlist name' })
  list_name?: string;

  @ApiProperty({ description: 'Priority level' })
  priority!: number;

  @ApiProperty({ description: 'Is notification enabled' })
  is_notification_enabled!: boolean;

  @ApiProperty({ description: 'Target price' })
  target_price?: number;

  @ApiProperty({ description: 'Target date' })
  target_date?: Date;

  @ApiProperty({ description: 'Created at timestamp' })
  created_at!: Date;

  @ApiProperty({ description: 'Updated at timestamp' })
  updated_at!: Date;
}
