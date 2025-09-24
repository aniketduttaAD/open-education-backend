import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Req,
  Res,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { OrderPaymentsService } from './services/order-payments.service';
import { CreateOrderDto, VerifyPaymentDto } from './dto';
import { JwtAuthGuard } from '../../common/guards';
import { CurrentUser } from '../../common/decorators';
import { JwtPayload } from '../../config/jwt.config';

@ApiTags('Order Payments')
@Controller('order-payments')
@UseGuards(JwtAuthGuard)
export class OrderPaymentController {
  constructor(
    private readonly orderPaymentsService: OrderPaymentsService,
  ) {}

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
        payments: order.payments?.map(payment => ({
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
  async getUserOrders(@CurrentUser() user: JwtPayload) {
    const orders = await this.orderPaymentsService.getUserOrders(user.sub);
    return {
      success: true,
      data: orders.map(order => ({
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
    return { success: true, data: earnings };
  }

  // Payouts disabled for now
}

@ApiTags('Webhooks')
@Controller('webhook')
export class WebhookController {
  constructor(
    private readonly orderPaymentsService: OrderPaymentsService
  ) {}

  @Post('razorpay')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Handle Razorpay webhook' })
  @ApiResponse({ status: 200, description: 'Webhook processed successfully' })
  @ApiResponse({ status: 400, description: 'Invalid webhook signature' })
  async handleRazorpayWebhook(@Req() req: any, @Res() res: any) {
    try {
      const signature = req.headers['x-razorpay-signature'];
      const webhookData = req.body;
      if (!signature) {
        return res.status(400).send('Missing webhook signature');
      }
      await this.orderPaymentsService.handleWebhook(webhookData, signature);
      res.status(200).send('OK');
    } catch (error) {
      console.error(`Webhook processing failed: ${error.message}`);
      res.status(400).send('Bad Request');
    }
  }
}