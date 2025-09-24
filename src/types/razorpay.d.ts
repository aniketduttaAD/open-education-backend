declare module 'razorpay' {
  interface RazorpayOptions {
    key_id: string;
    key_secret: string;
  }

  interface RazorpayOrder {
    amount: number;
    currency: string;
    receipt: string;
    notes?: Record<string, any>;
  }

  interface RazorpayPayment {
    id: string;
    amount: number;
    currency: string;
    status: string;
    order_id: string;
    method: string;
    description: string;
    vpa?: string;
    email: string;
    contact: string;
    notes: Record<string, any>;
    fee: number;
    tax: number;
    error_code?: string;
    error_description?: string;
    error_source?: string;
    error_step?: string;
    error_reason?: string;
    acquirer_data: Record<string, any>;
    created_at: number;
  }

  class Razorpay {
    constructor(options: RazorpayOptions);
    orders: {
      create(options: RazorpayOrder): Promise<any>;
      fetch(orderId: string): Promise<any>;
      all(params?: any): Promise<any>;
    };
    payments: {
      fetch(paymentId: string): Promise<RazorpayPayment>;
      all(params?: any): Promise<any>;
      capture(paymentId: string, amount: number, currency: string): Promise<any>;
      refund(paymentId: string, amount: number): Promise<any>;
      fetchRefund(refundId: string): Promise<any>;
    };
    refunds: {
      create(params: any): Promise<any>;
      fetch(refundId: string): Promise<any>;
      all(params?: any): Promise<any>;
    };
    webhooks: {
      validateWebhookSignature(body: string, signature: string, secret: string): boolean;
    };
  }

  export = Razorpay;
}
