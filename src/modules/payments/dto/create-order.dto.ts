import { IsEnum, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { OrderType } from '../entities/order.entity';

export class CreateOrderDto {
  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsNumber()
  @Min(1)
  amount!: number; // Amount in rupees

  @IsOptional()
  @IsString()
  currency?: string = 'INR';

  @IsOptional()
  @IsString()
  receipt?: string;

  @IsEnum(['tutor_registration', 'course_enrollment'])
  orderType!: OrderType;

  @IsOptional()
  metadata?: any;

  @IsOptional()
  @IsUUID()
  courseId?: string;

  @IsOptional()
  @IsUUID()
  tutorId?: string;
}
