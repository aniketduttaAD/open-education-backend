import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards';
import { CurrentUser } from '../../common/decorators';
import { JwtPayload } from '../../config/jwt.config';
import { CreateOrderDto, VerifyPaymentDto } from './dto';
import { OrderPaymentsService } from './services/order-payments.service';

@ApiTags('Payments')
@Controller('payments')
@UseGuards(JwtAuthGuard)
export class PaymentsController {
  constructor(private readonly orderPaymentsService: OrderPaymentsService) {}

  @Post('create-order')
  @ApiOperation({ summary: 'Create order for payment' })
  @ApiResponse({ status: 201, description: 'Order created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid order data' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiBearerAuth()
  async createOrder(@Body() createOrderDto: CreateOrderDto, @CurrentUser() user: JwtPayload) {
    createOrderDto.userId = user.sub;
    const result = await this.orderPaymentsService.createOrder(createOrderDto);
    return {
      success: true,
      message: 'Order created successfully',
      data: {
        orderId: result.order.id,
        razorpayOrderId: result.razorpayOrder.id,
        amount: result.order.getAmountInRupees(),
        currency: result.order.currency,
        keyId: result.keyId,
        receipt: result.order.receipt,
      },
    };
  }

  @Post('verify-payment')
  @ApiOperation({ summary: 'Verify payment with Razorpay' })
  @ApiResponse({ status: 200, description: 'Payment verified successfully' })
  @ApiResponse({ status: 400, description: 'Invalid payment signature' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  @ApiBearerAuth()
  async verifyPayment(@Body() verifyDto: VerifyPaymentDto, @CurrentUser() user: JwtPayload) {
    const result = await this.orderPaymentsService.verifyPayment(verifyDto, user.sub);
    return {
      success: true,
      message: 'Payment verified successfully',
      data: {
        orderId: result.order.id,
        orderType: result.order.orderType,
        status: result.order.status,
        amount: result.order.getAmountInRupees(),
        currency: result.order.currency,
        paymentId: result.payment.id,
      },
    };
  }

  @Get('order/:orderId')
  @ApiOperation({ summary: 'Get order by ID' })
  @ApiResponse({ status: 200, description: 'Order retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  @ApiBearerAuth()
  async getOrder(@Param('orderId') orderId: string) {
    const order = await this.orderPaymentsService.getOrderById(orderId);
    return {
      success: true,
      data: {
        orderId: order.id,
        orderType: order.orderType,
        status: order.status,
        amount: order.getAmountInRupees(),
        currency: order.currency,
        receipt: order.receipt,
        createdAt: order.createdAt,
        payments: order.payments?.map((payment) => ({
          id: payment.id,
          paymentCaptured: payment.paymentCaptured,
          paymentMethod: payment.paymentMethod,
          capturedAt: payment.capturedAt,
        })),
      },
    };
  }

  @Get('user-orders')
  @ApiOperation({ summary: 'Get user orders' })
  @ApiResponse({ status: 200, description: 'User orders retrieved successfully' })
  @ApiBearerAuth()
  async getUserOrders(
    @CurrentUser() user: JwtPayload,
    @Query('range') range?: 'week' | 'month' | 'year' | 'all',
    @Query('sort') sort?: 'asc' | 'desc',
  ) {
    const orders = await this.orderPaymentsService.getUserOrdersFiltered(user.sub, range, sort);
    return {
      success: true,
      data: orders.map((order) => ({
        orderId: order.id,
        orderType: order.orderType,
        status: order.status,
        amount: order.getAmountInRupees(),
        currency: order.currency,
        receipt: order.receipt,
        createdAt: order.createdAt,
        hasPayments: order.payments && order.payments.length > 0,
      })),
    };
  }

  @Get('tutor-earnings')
  @ApiOperation({ summary: 'Get tutor earnings summary' })
  @ApiResponse({ status: 200, description: 'Tutor earnings retrieved successfully' })
  @ApiBearerAuth()
  async getTutorEarnings(@CurrentUser() user: JwtPayload, @Query('monthYear') monthYear?: string) {
    const earnings = await this.orderPaymentsService.getTutorEarningsSummary(user.sub, monthYear);
    return {
      success: true,
      data: {
        totalGrossAmount: earnings?.total_gross_amount ? earnings.total_gross_amount / 100 : 0,
        totalCommission: earnings?.total_commission ? earnings.total_commission / 100 : 0,
        totalEarnings: earnings?.total_earnings ? earnings.total_earnings / 100 : 0,
        courseCount: earnings?.course_count || 0,
      },
    };
  }

  @Get('tutor-payments')
  @ApiOperation({ summary: 'List tutor earnings records' })
  @ApiResponse({ status: 200, description: 'Tutor payments retrieved successfully' })
  @ApiBearerAuth()
  async getTutorPayments(
    @CurrentUser() user: JwtPayload,
    @Query('range') range?: 'week' | 'month' | 'year' | 'all',
    @Query('sort') sort?: 'asc' | 'desc',
  ) {
    const payments = await this.orderPaymentsService.getTutorPaymentsFiltered(user.sub, range, sort);
    return {
      success: true,
      data: payments.map((p) => ({
        id: p.id,
        orderId: p.orderId,
        courseId: p.courseId,
        grossAmount: p.getGrossAmountInRupees(),
        platformCommission: p.getCommissionInRupees(),
        tutorEarnings: p.getEarningsInRupees(),
        payoutStatus: p.payoutStatus,
        createdAt: p.createdAt,
      })),
    };
  }

  @Get('monthly-payouts')
  @ApiOperation({ summary: 'Get tutor monthly payouts' })
  @ApiResponse({ status: 200, description: 'Monthly payouts retrieved successfully' })
  @ApiBearerAuth()
  async getMonthlyPayouts(@CurrentUser() user: JwtPayload) {
    const payouts = await this.orderPaymentsService.getTutorMonthlyPayouts(user.sub);
    return {
      success: true,
      data: payouts.map((payout: any) => ({
        id: payout.id,
        monthYear: payout.month_year,
        totalEarnings: payout.total_earnings / 100,
        totalCommission: payout.total_commission / 100,
        netPayout: payout.net_payout / 100,
        payoutStatus: payout.payout_status,
        payoutDate: payout.payout_date,
        createdAt: payout.created_at,
      })),
    };
  }
}


