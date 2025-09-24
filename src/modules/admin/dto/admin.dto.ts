import { IsString, IsOptional, IsEnum, IsBoolean, IsObject, IsArray, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSystemConfigDto {
  @ApiProperty({ description: 'Configuration key' })
  @IsString()
  key!: string;

  @ApiProperty({ description: 'Configuration value' })
  @IsString()
  value!: string;

  @ApiPropertyOptional({ 
    description: 'Configuration category',
    enum: ['general', 'payment', 'email', 'storage', 'security', 'features', 'analytics'],
    default: 'general'
  })
  @IsOptional()
  @IsEnum(['general', 'payment', 'email', 'storage', 'security', 'features', 'analytics'])
  category?: 'general' | 'payment' | 'email' | 'storage' | 'security' | 'features' | 'analytics';

  @ApiPropertyOptional({ 
    description: 'Configuration type',
    enum: ['string', 'number', 'boolean', 'json', 'array'],
    default: 'string'
  })
  @IsOptional()
  @IsEnum(['string', 'number', 'boolean', 'json', 'array'])
  type?: 'string' | 'number' | 'boolean' | 'json' | 'array';

  @ApiProperty({ description: 'Configuration description' })
  @IsString()
  description!: string;

  @ApiPropertyOptional({ description: 'Is public configuration', default: true })
  @IsOptional()
  @IsBoolean()
  is_public?: boolean;

  @ApiPropertyOptional({ description: 'Is required configuration', default: false })
  @IsOptional()
  @IsBoolean()
  is_required?: boolean;

  @ApiPropertyOptional({ description: 'Validation rules' })
  @IsOptional()
  @IsString()
  validation_rules?: string;

  @ApiPropertyOptional({ description: 'Default value' })
  @IsOptional()
  @IsString()
  default_value?: string;
}

export class UpdateSystemConfigDto {
  @ApiPropertyOptional({ description: 'Configuration value' })
  @IsOptional()
  @IsString()
  value?: string;

  @ApiPropertyOptional({ description: 'Configuration description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Is public configuration' })
  @IsOptional()
  @IsBoolean()
  is_public?: boolean;

  @ApiPropertyOptional({ description: 'Is required configuration' })
  @IsOptional()
  @IsBoolean()
  is_required?: boolean;

  @ApiPropertyOptional({ description: 'Validation rules' })
  @IsOptional()
  @IsString()
  validation_rules?: string;
}

export class BulkUserActionDto {
  @ApiProperty({ description: 'User IDs to perform action on' })
  @IsArray()
  @IsUUID(4, { each: true })
  user_ids!: string[];

  @ApiProperty({ 
    description: 'Action to perform',
    enum: ['suspend', 'activate', 'delete', 'export_data']
  })
  @IsEnum(['suspend', 'activate', 'delete', 'export_data'])
  action!: 'suspend' | 'activate' | 'delete' | 'export_data';

  @ApiPropertyOptional({ description: 'Reason for action' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class BulkCourseActionDto {
  @ApiProperty({ description: 'Course IDs to perform action on' })
  @IsArray()
  @IsUUID(4, { each: true })
  course_ids!: string[];

  @ApiProperty({ 
    description: 'Action to perform',
    enum: ['approve', 'reject', 'delete', 'feature', 'unfeature']
  })
  @IsEnum(['approve', 'reject', 'delete', 'feature', 'unfeature'])
  action!: 'approve' | 'reject' | 'delete' | 'feature' | 'unfeature';

  @ApiPropertyOptional({ description: 'Reason for action' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class SystemStatsDto {
  @ApiProperty({ description: 'Total users' })
  total_users!: number;

  @ApiProperty({ description: 'Total tutors' })
  total_tutors!: number;

  @ApiProperty({ description: 'Total students' })
  total_students!: number;

  @ApiProperty({ description: 'Total courses' })
  total_courses!: number;

  @ApiProperty({ description: 'Total enrollments' })
  total_enrollments!: number;

  @ApiProperty({ description: 'Total revenue' })
  total_revenue!: number;

  @ApiProperty({ description: 'Active users this month' })
  active_users_this_month!: number;

  @ApiProperty({ description: 'New users this month' })
  new_users_this_month!: number;

  @ApiProperty({ description: 'New courses this month' })
  new_courses_this_month!: number;

  @ApiProperty({ description: 'Generated at timestamp' })
  generated_at!: string;
}

export class AdminActivityDto {
  @ApiProperty({ description: 'Activity ID' })
  id!: string;

  @ApiProperty({ description: 'Admin ID' })
  admin_id!: string;

  @ApiProperty({ description: 'Action performed' })
  action!: string;

  @ApiProperty({ description: 'Action description' })
  description!: string;

  @ApiProperty({ description: 'Target user ID' })
  target_user_id?: string;

  @ApiProperty({ description: 'Target course ID' })
  target_course_id?: string;

  @ApiProperty({ description: 'Activity metadata' })
  metadata?: any;

  @ApiProperty({ description: 'IP address' })
  ip_address?: string;

  @ApiProperty({ description: 'Created at timestamp' })
  created_at!: Date;
}
