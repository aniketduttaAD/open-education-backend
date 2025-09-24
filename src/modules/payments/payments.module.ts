import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
// import { ScheduleModule } from '@nestjs/schedule';
import { OrderPaymentController, WebhookController } from './order-payments.controller';
import { PaymentsController } from './payments.controller';
import { OrderPaymentsService } from './services/order-payments.service';
import { RazorpayService } from './services/razorpay.service';
import { Order, OrderPayment, TutorEarnings, WebhookEvent } from './entities';
import { User } from '../auth/entities/user.entity';
import { Course } from '../courses/entities/course.entity';
import { CourseEnrollment } from '../courses/entities/course-enrollment.entity';

/**
 * Payments module for handling all payment operations
 * Integrates with Razorpay for payment processing
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Order,
      OrderPayment,
      WebhookEvent,
      TutorEarnings,
      User,
      Course,
      CourseEnrollment,
    ]),
    // ScheduleModule.forRoot(), // Disabled while payouts are commented out
  ],
  controllers: [OrderPaymentController, WebhookController, PaymentsController],
  providers: [OrderPaymentsService, RazorpayService],
  exports: [OrderPaymentsService, RazorpayService],
})
export class PaymentsModule {}
