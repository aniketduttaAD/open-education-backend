import { IsEnum, IsString, IsOptional, IsBoolean, IsObject, IsDateString, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NotificationType } from '../entities/notification.entity';

export class CreateNotificationDto {
  @ApiProperty({ 
    enum: NotificationType, 
    description: 'Type of notification' 
  })
  @IsEnum(NotificationType)
  type!: NotificationType;

  @ApiProperty({ 
    description: 'Notification title' 
  })
  @IsString()
  title!: string;

  @ApiProperty({ 
    description: 'Notification message' 
  })
  @IsString()
  message!: string;

  @ApiPropertyOptional({ 
    description: 'Additional data' 
  })
  @IsOptional()
  @IsObject()
  data?: Record<string, any>;

  @ApiPropertyOptional({ 
    description: 'Additional metadata' 
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;

  @ApiPropertyOptional({ 
    description: 'Whether notification is important' 
  })
  @IsOptional()
  @IsBoolean()
  isImportant?: boolean;

  @ApiPropertyOptional({ 
    description: 'Whether action is required' 
  })
  @IsOptional()
  @IsBoolean()
  isActionRequired?: boolean;

  @ApiPropertyOptional({ 
    description: 'Action URL' 
  })
  @IsOptional()
  @IsString()
  actionUrl?: string;

  @ApiPropertyOptional({ 
    description: 'Action button text' 
  })
  @IsOptional()
  @IsString()
  actionText?: string;

  @ApiPropertyOptional({ 
    description: 'Schedule notification for later (ISO string)' 
  })
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @ApiPropertyOptional({ 
    description: 'Sender user ID' 
  })
  @IsOptional()
  @IsUUID()
  senderId?: string;
}
