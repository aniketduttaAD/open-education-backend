import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order, OrderStatus, OrderType } from '../entities/order.entity';
import { OrderPayment } from '../entities/order-payment.entity';
import { TutorEarnings } from '../entities/tutor-earnings.entity';
import { CourseEnrollment } from '../../courses/entities/course-enrollment.entity';
import { Course } from '../../courses/entities/course.entity';
import { WebhookEvent } from '../entities/webhook-event.entity';
import { User } from '../../auth/entities/user.entity';
import { CreateOrderDto, VerifyPaymentDto } from '../dto';
import { RazorpayService } from './razorpay.service';
import { getPaymentConfig } from '../../../config/razorpay.config';

@Injectable()
export class OrderPaymentsService {
  private readonly logger = new Logger(OrderPaymentsService.name);

  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(OrderPayment)
    private readonly orderPaymentRepository: Repository<OrderPayment>,
    @InjectRepository(TutorEarnings)
    private readonly tutorEarningsRepository: Repository<TutorEarnings>,
    @InjectRepository(WebhookEvent)
    private readonly webhookEventRepository: Repository<WebhookEvent>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(CourseEnrollment)
    private readonly courseEnrollmentRepository: Repository<CourseEnrollment>,
    @InjectRepository(Course)
    private readonly courseRepository: Repository<Course>,
    private readonly razorpayService: RazorpayService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Create order for tutor registration or course enrollment
   */
  async createOrder(createOrderDto: CreateOrderDto): Promise<{
    order: Order;
    razorpayOrder: any;
    keyId: string;
  }> {
    this.logger.log(`Creating order for user: ${createOrderDto.userId}`);

    // Verify user exists
    const user = await this.userRepository.findOne({
      where: { id: createOrderDto.userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Compute amount (server-side authoritative)
    const paymentConfig = getPaymentConfig(this.configService);
    let amountInPaise: number;
    if (createOrderDto.orderType === 'tutor_registration') {
      amountInPaise = Math.round(paymentConfig.onboardingFee * 100);
    } else {
      // course_enrollment
      if (!createOrderDto.courseId || !createOrderDto.tutorId) {
        throw new BadRequestException('courseId and tutorId are required for course enrollment');
      }
      const rupees = createOrderDto.amount;
      if (rupees < paymentConfig.minCoursePrice || rupees > paymentConfig.maxCoursePrice) {
        throw new BadRequestException(`Amount must be between ₹${paymentConfig.minCoursePrice} and ₹${paymentConfig.maxCoursePrice}`);
      }
      amountInPaise = Math.round(rupees * 100);
    }

    // Create order record in database
    const order = this.orderRepository.create({
      userId: createOrderDto.userId,
      amount: amountInPaise,
      currency: createOrderDto.currency || 'INR',
      orderType: createOrderDto.orderType,
      receipt: createOrderDto.receipt || `receipt_${Date.now()}`,
      metadata: createOrderDto.metadata,
      status: 'pending',
      courseId: createOrderDto.courseId,
      tutorId: createOrderDto.tutorId,
    });

    const savedOrder = await this.orderRepository.save(order);

    // Create Razorpay order
    const razorpayOrder = await this.razorpayService.createOrder({
      amount: amountInPaise,
      currency: createOrderDto.currency || 'INR',
      receipt: savedOrder.receipt,
      notes: {
        order_id: savedOrder.id,
        user_id: createOrderDto.userId,
        order_type: createOrderDto.orderType,
        course_id: createOrderDto.courseId,
        tutor_id: createOrderDto.tutorId,
      },
    });

    // Update order with Razorpay order ID
    savedOrder.razorpayOrderId = razorpayOrder.id;
    await this.orderRepository.save(savedOrder);

    // Get Razorpay key ID for frontend
    const keyId = process.env.RAZORPAY_KEY_ID;

    return {
      order: savedOrder,
      razorpayOrder,
      keyId,
    };
  }

  /**
   * Verify payment with Razorpay
   */
  async verifyPayment(verifyDto: VerifyPaymentDto, currentUserId?: string): Promise<{
    order: Order;
    payment: OrderPayment;
    success: boolean;
  }> {
    this.logger.log(`Verifying payment: ${verifyDto.razorpayOrderId}`);

    // Get order by Razorpay order ID
    const order = await this.orderRepository.findOne({
      where: { razorpayOrderId: verifyDto.razorpayOrderId },
      relations: ['user'],
    });
    // Ownership check (if current user context provided)
    if (currentUserId && order.userId !== currentUserId) {
      this.logger.warn(`Ownership check failed for order ${order.id} by user ${currentUserId}`);
      throw new BadRequestException('You are not allowed to verify this order');
    }

    // Idempotency: if already verified, return existing state
    if (order.status === 'payment_verified') {
      const existingPayment = await this.orderPaymentRepository.findOne({ where: { orderId: order.id } });
      if (existingPayment) {
        return { order, payment: existingPayment, success: true };
      }
    }

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // Verify signature with Razorpay
    const isValidSignature = this.razorpayService.verifyPaymentSignature(
      verifyDto.razorpayOrderId,
      verifyDto.razorpayPaymentId,
      verifyDto.razorpaySignature,
    );

    if (!isValidSignature) {
      throw new BadRequestException('Invalid payment signature');
    }

    // Fetch payment details from Razorpay
    const razorpayPayment = await this.razorpayService.getPayment(verifyDto.razorpayPaymentId);

    // Amount parity check
    // Convert both amounts to numbers to handle potential string conversion from database
    const orderAmount = typeof order.amount === 'string' 
      ? parseInt(order.amount, 10) 
      : Number(order.amount);
    
    const razorpayAmount = typeof razorpayPayment.amount === 'string' 
      ? parseInt(razorpayPayment.amount, 10) 
      : Number(razorpayPayment.amount);
    
    // Detailed logging for debugging
    this.logger.log(`Amount comparison debug:`);
    this.logger.log(`  Order amount: ${order.amount} -> ${orderAmount} (type: ${typeof orderAmount})`);
    this.logger.log(`  Razorpay amount: ${razorpayPayment.amount} -> ${razorpayAmount} (type: ${typeof razorpayAmount})`);
    this.logger.log(`  Strict equality: ${orderAmount === razorpayAmount}`);
    this.logger.log(`  Loose equality: ${orderAmount == razorpayAmount}`);
    
    if (orderAmount !== razorpayAmount) {
      this.logger.error(`Amount mismatch for order ${order.id}: local=${orderAmount} gateway=${razorpayAmount}`);
      this.logger.error(`Original values - Order: ${order.amount} (${typeof order.amount}), Razorpay: ${razorpayPayment.amount} (${typeof razorpayPayment.amount})`);
      throw new BadRequestException('Payment amount mismatch');
    }

    // Create payment record
    const payment = this.orderPaymentRepository.create({
      orderId: order.id,
      razorpayPaymentId: verifyDto.razorpayPaymentId,
      razorpaySignature: verifyDto.razorpaySignature,
      paymentMethod: razorpayPayment.method,
      paymentCaptured: true,
      capturedAt: new Date(),
      gatewayResponse: razorpayPayment,
    });

    const savedPayment = await this.orderPaymentRepository.save(payment);

    // Update order status
    order.status = 'payment_verified';
    await this.orderRepository.save(order);

    // Handle business logic based on order type
    await this.handleOrderCompletion(order, savedPayment);

    return {
      order,
      payment: savedPayment,
      success: true,
    };
  }

  /**
   * Handle order completion business logic
   */
  private async handleOrderCompletion(order: Order, payment: OrderPayment): Promise<void> {
    if (order.orderType === 'tutor_registration') {
      // Update user's tutor_details to mark registration fee as paid
      const user = await this.userRepository.findOne({
        where: { id: order.userId },
      });

      if (user) {
        const details = user.tutor_details || {} as any;
        details.register_fees_paid = true;
        // Do not auto-verify if you want admin review; otherwise leave as-is
        details.verification_status = details.verification_status || 'verified';
        user.tutor_details = details;
        await this.userRepository.save(user);
      }
    } else if (order.orderType === 'course_enrollment') {
      // Enroll the student to the course and create tutor earnings
      await this.enrollStudentIfNeeded(order.userId, order.courseId!);
      await this.createTutorEarnings(order, payment);
    }
  }

  /**
   * Create tutor earnings record for course sale
   */
  private async createTutorEarnings(order: Order, payment: OrderPayment): Promise<void> {
    if (!order.courseId || !order.tutorId) {
      this.logger.warn('Course ID or Tutor ID missing for course enrollment order');
      return;
    }

    // Calculate earnings (70% to tutor, 30% platform commission)
    const grossAmount = order.amount;
    const platformCommission = Math.round((grossAmount * 30) / 100);
    const tutorEarnings = grossAmount - platformCommission;

    const tutorEarningsRecord = this.tutorEarningsRepository.create({
      tutorId: order.tutorId,
      orderId: order.id,
      courseId: order.courseId,
      grossAmount,
      platformCommission,
      tutorEarnings,
      payoutStatus: 'pending',
    });

    await this.tutorEarningsRepository.save(tutorEarningsRecord);
    this.logger.log(`Tutor earnings created: ₹${tutorEarnings / 100} for tutor ${order.tutorId}`);
  }

  /**
   * Enroll student into course after successful payment
   */
  private async enrollStudentIfNeeded(studentId: string, courseId: string): Promise<void> {
    if (!studentId || !courseId) {
      this.logger.warn('Missing studentId or courseId for enrollment');
      return;
    }

    // Already enrolled?
    const existing = await this.courseEnrollmentRepository.findOne({ where: { student_id: studentId, course_id: courseId } });
    if (existing) {
      return;
    }

    // Ensure course is published/available
    const course = await this.courseRepository.findOne({ where: { id: courseId } });
    if (!course) {
      this.logger.warn(`Course not found for enrollment: ${courseId}`);
      return;
    }
    if ((course as any).status && (course as any).status !== 'published') {
      this.logger.warn(`Course not published for enrollment: ${courseId}`);
      return;
    }

    const enrollment = this.courseEnrollmentRepository.create({
      student_id: studentId,
      course_id: courseId,
      status: 'active',
      started_at: new Date(),
    });
    await this.courseEnrollmentRepository.save(enrollment);
  }

  /**
   * Handle Razorpay webhook
   */
  async handleWebhook(webhookData: any, signature: string): Promise<void> {
    this.logger.log('Processing Razorpay webhook');

    // Verify webhook signature
    const body = JSON.stringify(webhookData);
    const isValidSignature = this.razorpayService.verifyWebhookSignature(body, signature);

    if (!isValidSignature) {
      throw new BadRequestException('Invalid webhook signature');
    }

    // Store webhook event
    const webhookEvent = this.webhookEventRepository.create({
      eventType: webhookData.event,
      payload: webhookData,
      receivedAt: new Date(),
    });

    await this.webhookEventRepository.save(webhookEvent);

    // Process webhook based on event type
    await this.processWebhookEvent(webhookEvent);
  }

  /**
   * Process webhook event
   */
  private async processWebhookEvent(webhookEvent: WebhookEvent): Promise<void> {
    try {
      const { eventType, payload } = webhookEvent;

      switch (eventType) {
        case 'payment.captured':
          await this.handlePaymentCaptured(payload);
          break;
        case 'payment.failed':
          await this.handlePaymentFailed(payload);
          break;
        default:
          this.logger.log(`Unhandled webhook event: ${eventType}`);
      }

      // Mark as processed
      webhookEvent.processed = true;
      webhookEvent.processedAt = new Date();
      await this.webhookEventRepository.save(webhookEvent);
    } catch (error) {
      this.logger.error(`Error processing webhook event: ${error.message}`);
      webhookEvent.errorMessage = error.message;
      await this.webhookEventRepository.save(webhookEvent);
    }
  }

  /**
   * Handle payment captured webhook
   */
  private async handlePaymentCaptured(payload: any): Promise<void> {
    const { order_id } = payload.payment.entity;

    const order = await this.orderRepository.findOne({
      where: { razorpayOrderId: order_id },
    });

    if (order) {
      order.status = 'captured';
      await this.orderRepository.save(order);
    }
  }

  /**
   * Handle payment failed webhook
   */
  private async handlePaymentFailed(payload: any): Promise<void> {
    const { order_id } = payload.payment.entity;

    const order = await this.orderRepository.findOne({
      where: { razorpayOrderId: order_id },
    });

    if (order) {
      order.status = 'failed';
      await this.orderRepository.save(order);
    }
  }

  /**
   * Get order by ID
   */
  async getOrderById(orderId: string): Promise<Order> {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: ['user', 'payments'],
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return order;
  }

  /**
   * Get user orders
   */
  async getUserOrders(userId: string): Promise<Order[]> {
    return await this.orderRepository.find({
      where: { userId },
      relations: ['payments'],
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Get tutor earnings summary
   */
  async getTutorEarningsSummary(tutorId: string, monthYear?: string): Promise<any> {
    let query = this.tutorEarningsRepository
      .createQueryBuilder('te')
      .select([
        'SUM(te.gross_amount) as total_gross_amount',
        'SUM(te.platform_commission) as total_commission',
        'SUM(te.tutor_earnings) as total_earnings',
        'COUNT(te.id) as course_count',
      ])
      .where('te.tutor_id = :tutorId', { tutorId });

    if (monthYear) {
      query = query.andWhere('DATE_TRUNC(\'month\', te.created_at) = :monthYear', {
        monthYear: new Date(monthYear + '-01'),
      });
    }

    return await query.getRawOne();
  }

  /**
   * Get tutor monthly payouts
   */
  async getTutorMonthlyPayouts(tutorId: string): Promise<any[]> {
    const query = `
      SELECT
        mp.id,
        mp.month_year,
        mp.total_earnings,
        mp.total_commission,
        mp.net_payout,
        mp.payout_status,
        mp.payout_date,
        mp.created_at
      FROM monthly_payouts mp
      WHERE mp.tutor_id = $1
      ORDER BY mp.created_at DESC
    `;

    return await this.tutorEarningsRepository.query(query, [tutorId]);
  }

  private computeStartDate(range?: string): Date | null {
    const now = new Date();
    switch ((range || 'all').toLowerCase()) {
      case 'week': {
        const d = new Date(now);
        d.setDate(d.getDate() - 7);
        return d;
      }
      case 'month': {
        const d = new Date(now.getFullYear(), now.getMonth(), 1);
        return d;
      }
      case 'year': {
        const d = new Date(now.getFullYear(), 0, 1);
        return d;
      }
      case 'all':
      default:
        return null;
    }
  }

  async getUserOrdersFiltered(
    userId: string,
    range?: 'week' | 'month' | 'year' | 'all',
    sort?: 'asc' | 'desc',
  ): Promise<Order[]> {
    const qb = this.orderRepository
      .createQueryBuilder('o')
      .leftJoinAndSelect('o.payments', 'p')
      .where('o.user_id = :userId', { userId });

    const startDate = this.computeStartDate(range);
    if (startDate) {
      qb.andWhere('o.created_at >= :startDate', { startDate });
    }

    qb.orderBy('o.created_at', (sort || 'desc').toUpperCase() as 'ASC' | 'DESC');
    return await qb.getMany();
  }

  async getTutorPaymentsFiltered(
    tutorId: string,
    range?: 'week' | 'month' | 'year' | 'all',
    sort?: 'asc' | 'desc',
  ): Promise<TutorEarnings[]> {
    const qb = this.tutorEarningsRepository
      .createQueryBuilder('te')
      .where('te.tutor_id = :tutorId', { tutorId });

    const startDate = this.computeStartDate(range);
    if (startDate) {
      qb.andWhere('te.created_at >= :startDate', { startDate });
    }

    qb.orderBy('te.created_at', (sort || 'desc').toUpperCase() as 'ASC' | 'DESC');
    return await qb.getMany();
  }
}