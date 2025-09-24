import { IsEnum, IsBoolean, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NotificationType, DeliveryChannel } from '../entities/notification.entity';

export class NotificationPreferencesDto {
  @ApiPropertyOptional({ 
    description: 'Enable in-app notifications' 
  })
  @IsOptional()
  @IsBoolean()
  inApp?: boolean;

  @ApiPropertyOptional({ 
    description: 'Enable email notifications' 
  })
  @IsOptional()
  @IsBoolean()
  email?: boolean;

  @ApiPropertyOptional({ 
    description: 'Enable push notifications' 
  })
  @IsOptional()
  @IsBoolean()
  push?: boolean;

  @ApiPropertyOptional({ 
    description: 'Enable SMS notifications' 
  })
  @IsOptional()
  @IsBoolean()
  sms?: boolean;

  @ApiPropertyOptional({ 
    description: 'Enable marketing notifications' 
  })
  @IsOptional()
  @IsBoolean()
  marketing?: boolean;

  @ApiPropertyOptional({ 
    description: 'Enable system notifications' 
  })
  @IsOptional()
  @IsBoolean()
  system?: boolean;
}

export class NotificationTypePreferencesDto {
  @ApiProperty({ 
    enum: NotificationType, 
    description: 'Notification type' 
  })
  @IsEnum(NotificationType)
  type!: NotificationType;

  @ApiProperty({ 
    enum: DeliveryChannel, 
    isArray: true,
    description: 'Enabled delivery channels for this type' 
  })
  @IsEnum(DeliveryChannel, { each: true })
  channels!: DeliveryChannel[];

  @ApiPropertyOptional({ 
    description: 'Whether this notification type is enabled' 
  })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
