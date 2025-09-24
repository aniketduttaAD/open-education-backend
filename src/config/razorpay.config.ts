import { ConfigService } from '@nestjs/config';

export interface RazorpayConfig {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
  currency: string;
}

export const getRazorpayConfig = (configService: ConfigService): RazorpayConfig => {
  const keyId = configService.get<string>('RAZORPAY_KEY_ID');
  const keySecret = configService.get<string>('RAZORPAY_KEY_SECRET');
  const webhookSecret = configService.get<string>('RAZORPAY_WEBHOOK_SECRET');

  if (!keyId || !keySecret) {
    throw new Error('RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are required');
  }

  if (!webhookSecret) {
    throw new Error('RAZORPAY_WEBHOOK_SECRET is required for webhook verification');
  }

  return {
    keyId,
    keySecret,
    webhookSecret,
    currency: 'INR', // Hardcoded
  };
};

export interface PaymentConfig {
  tutorCommissionPercentage: number;
  onboardingFee: number;
  minCoursePrice: number;
  maxCoursePrice: number;
  maxRevisions: number;
}

export const getPaymentConfig = (configService: ConfigService): PaymentConfig => ({
  tutorCommissionPercentage: 80, // Hardcoded
  onboardingFee: 1000, // Hardcoded
  minCoursePrice: 500, // Hardcoded
  maxCoursePrice: 1000, // Hardcoded
  maxRevisions: 5, // Hardcoded
});

export default getRazorpayConfig;
