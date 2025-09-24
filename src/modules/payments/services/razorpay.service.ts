import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import { getRazorpayConfig } from '../../../config';

/**
 * Razorpay service for payment processing
 * Handles order creation, payment verification, and webhook processing
 */
@Injectable()
export class RazorpayService {
  private readonly logger = new Logger(RazorpayService.name);
  private readonly razorpay: Razorpay;
  private readonly webhookSecret: string;
  private readonly keySecret: string;

  constructor(private readonly configService: ConfigService) {
    const razorpayConfig = getRazorpayConfig(this.configService);

    this.webhookSecret = razorpayConfig.webhookSecret;
    this.keySecret = razorpayConfig.keySecret;

    this.razorpay = new Razorpay({
      key_id: razorpayConfig.keyId,
      key_secret: razorpayConfig.keySecret,
    });
  }

  /**
   * Create a new Razorpay order
   */
  async createOrder(orderData: {
    amount: number;
    currency: string;
    receipt: string;
    notes?: Record<string, any>;
  }): Promise<any> {
    try {
      const order = await this.razorpay.orders.create({
        amount: orderData.amount,
        currency: orderData.currency,
        receipt: orderData.receipt,
        notes: orderData.notes,
      });

      this.logger.log(`Order created: ${order.id}`);
      return order;
    } catch (error) {
      this.logger.error('Failed to create Razorpay order', error);
      throw new BadRequestException('Failed to create payment order');
    }
  }

  /**
   * Fetch order details from Razorpay
   */
  async getOrder(orderId: string): Promise<any> {
    try {
      const order = await this.razorpay.orders.fetch(orderId);
      return order;
    } catch (error) {
      this.logger.error(`Failed to fetch order: ${orderId}`, error);
      throw new BadRequestException('Order not found');
    }
  }

  /**
   * Fetch payment details from Razorpay
   */
  async getPayment(paymentId: string): Promise<any> {
    try {
      const payment = await this.razorpay.payments.fetch(paymentId);
      return payment;
    } catch (error) {
      this.logger.error(`Failed to fetch payment: ${paymentId}`, error);
      throw new BadRequestException('Payment not found');
    }
  }

  /**
   * Verify payment signature
   */
  verifyPaymentSignature(
    orderId: string,
    paymentId: string,
    signature: string,
  ): boolean {
    try {
      const body = orderId + '|' + paymentId;
      const expectedSignature = crypto
        .createHmac('sha256', this.keySecret)
        .update(body)
        .digest('hex');

      return expectedSignature === signature;
    } catch (error) {
      this.logger.error('Failed to verify payment signature', error);
      return false;
    }
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(body: string, signature: string): boolean {
    try {
      const expectedSignature = crypto
        .createHmac('sha256', this.webhookSecret)
        .update(body)
        .digest('hex');

      return expectedSignature === signature;
    } catch (error) {
      this.logger.error('Failed to verify webhook signature', error);
      return false;
    }
  }

  /**
   * Create a refund
   */
  async createRefund(paymentId: string, amount?: number, notes?: string): Promise<any> {
    try {
      const refundData: any = {
        payment_id: paymentId,
      };

      if (amount) {
        refundData.amount = amount;
      }

      if (notes) {
        refundData.notes = { reason: notes };
      }

      const refund = await this.razorpay.payments.refund(paymentId, refundData);
      this.logger.log(`Refund created: ${refund.id}`);
      return refund;
    } catch (error) {
      this.logger.error(`Failed to create refund for payment: ${paymentId}`, error);
      throw new BadRequestException('Failed to create refund');
    }
  }

  /**
   * Fetch refund details
   */
  async getRefund(paymentId: string, refundId: string): Promise<any> {
    try {
      const refund = await this.razorpay.payments.fetchRefund(refundId);
      return refund;
    } catch (error) {
      this.logger.error(`Failed to fetch refund: ${refundId}`, error);
      throw new BadRequestException('Refund not found');
    }
  }

  /**
   * Get all refunds for a payment
   */
  async getRefunds(paymentId: string): Promise<any> {
    try {
      const refunds = await this.razorpay.payments.all({ paymentId: paymentId } as any);
      return refunds;
    } catch (error) {
      this.logger.error(`Failed to fetch refunds for payment: ${paymentId}`, error);
      throw new BadRequestException('Failed to fetch refunds');
    }
  }

  /**
   * Create payout to tutor's bank account
   */
  async createPayout(payoutData: {
    account_number: string;
    fund_account: any;
    amount: number;
    currency: string;
    mode: string;
    purpose: string;
    queue_if_low_balance: boolean;
    reference_id: string;
    narration: string;
  }): Promise<any> {
    try {
      // Note: Payout API requires activation. Disable simulation in production paths.
      // Throw until proper payout integration is enabled.
      this.logger.warn('Payout API not enabled. Configure Razorpay payouts before use.');
      throw new BadRequestException('Payout API not enabled');
    } catch (error) {
      this.logger.error('Failed to create payout', error);
      throw new BadRequestException('Failed to create payout');
    }
  }

  /**
   * Get payout details
   */
  async getPayout(payoutId: string): Promise<any> {
    try {
      // Note: Payout API requires activation. No-op until enabled.
      this.logger.warn('Payout API not enabled. Cannot fetch payout.');
      throw new BadRequestException('Payout API not enabled');
    } catch (error) {
      this.logger.error(`Failed to fetch payout: ${payoutId}`, error);
      throw new BadRequestException('Payout not found');
    }
  }

  /**
   * Health check for Razorpay service
   */
  async healthCheck(): Promise<{ status: string; message: string }> {
    try {
      await this.razorpay.orders.all({ count: 1 });
      return { status: 'healthy', message: 'Razorpay service is accessible' };
    } catch {
      return { status: 'unhealthy', message: 'Razorpay service is not accessible' };
    }
  }
}
