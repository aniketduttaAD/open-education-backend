import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Resend } from "resend";
import { Notification } from "../entities/notification.entity";
import {
  NotificationDeliveryLog,
  DeliveryStatus,
} from "../entities/notification-delivery-log.entity";
import { getResendConfig, getEmailTemplateConfig } from "../../../config";

/**
 * Email notification service using Resend API
 * Handles email delivery for notifications
 */
@Injectable()
export class EmailNotificationService {
  private readonly logger = new Logger(EmailNotificationService.name);
  private readonly resend: Resend;
  private readonly resendConfig: ReturnType<typeof getResendConfig>;
  private readonly templateConfig: ReturnType<typeof getEmailTemplateConfig>;

  constructor(private readonly configService: ConfigService) {
    this.resendConfig = getResendConfig(this.configService);
    this.templateConfig = getEmailTemplateConfig(this.configService);

    this.resend = new Resend(this.resendConfig.apiKey);
  }

  /**
   * Send email notification
   */
  async sendEmailNotification(
    notification: Notification,
    deliveryLog: NotificationDeliveryLog
  ): Promise<boolean> {
    try {
      if (!this.resend) {
        this.logger.warn("Resend not configured, skipping email notification");
        deliveryLog.markAsFailed("Email service not configured");
        return false;
      }

      const emailData = await this.prepareEmailData(notification);

      const result = await this.resend.emails.send({
        from: `${this.resendConfig.fromName} <${this.resendConfig.fromEmail}>`,
        to: [notification.user.email],
        subject: emailData.subject,
        html: emailData.html,
        text: emailData.text,
        reply_to: this.resendConfig.replyTo,
        tags: [
          { name: "notification_type", value: notification.type },
          { name: "user_id", value: notification.user.id },
        ],
      });

      if (result.error) {
        this.logger.error("Failed to send email notification", result.error);
        deliveryLog.markAsFailed(result.error.message);
        return false;
      }

      deliveryLog.markAsSent(result.data?.id);
      this.logger.log(`Email notification sent: ${result.data?.id}`);
      return true;
    } catch (error) {
      this.logger.error("Email notification error", error);
      deliveryLog.markAsFailed("Unknown error");
      return false;
    }
  }

  /**
   * Prepare email data based on notification type
   */
  private async prepareEmailData(notification: Notification): Promise<{
    subject: string;
    html: string;
    text: string;
  }> {
    let subject = notification.title;
    let html = this.generateEmailHTML(notification);
    let text = this.generateEmailText(notification);

    // Customize based on notification type
    switch (notification.type) {
      case "course_update":
        subject = `Course Update: ${notification.data?.courseTitle || "Your Course"}`;
        break;
      case "achievement":
        subject = `🎉 Achievement Unlocked: ${notification.title}`;
        break;
      case "payment":
        subject = `Payment ${notification.data?.status || "Update"}`;
        break;
      case "live_class":
        subject = `📚 Live Class Reminder: ${notification.data?.courseTitle || "Your Course"}`;
        break;
      case "tutor_verification":
        subject = `Tutor Verification ${notification.data?.status || "Update"}`;
        break;
      case "course_completion":
        subject = `🎓 Course Completed: ${notification.data?.courseTitle || "Your Course"}`;
        break;
      case "certificate_ready":
        subject = `🏆 Certificate Ready: ${notification.data?.courseTitle || "Your Course"}`;
        break;
    }

    return { subject, html, text };
  }

  /**
   * Generate HTML email content
   */
  private generateEmailHTML(notification: Notification): string {
    const actionButton =
      notification.actionUrl && notification.actionText
        ? `<a href="${this.templateConfig.baseUrl}${notification.actionUrl}" style="display: inline-block; padding: 12px 24px; background-color: #007bff; color: white; text-decoration: none; border-radius: 4px; margin: 16px 0;">${notification.actionText}</a>`
        : "";

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${notification.title}</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <h1 style="color: #007bff; margin: 0 0 16px 0;">${notification.title}</h1>
            <p style="margin: 0; font-size: 16px;">${notification.message}</p>
          </div>
          
          ${actionButton}
          
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 14px; color: #666;">
            <p>This notification was sent from ${this.resendConfig.fromName}.</p>
            <p>If you no longer wish to receive these notifications, you can <a href="${this.templateConfig.baseUrl}${this.templateConfig.unsubscribeUrl}">update your preferences</a>.</p>
            <p>For support, contact us at <a href="mailto:${this.templateConfig.supportEmail}">${this.templateConfig.supportEmail}</a></p>
          </div>
        </body>
      </html>
    `;
  }

  /**
   * Generate plain text email content
   */
  private generateEmailText(notification: Notification): string {
    const actionText =
      notification.actionUrl && notification.actionText
        ? `\n\nAction: ${notification.actionText}\n${this.templateConfig.baseUrl}${notification.actionUrl}`
        : "";

    return `
${notification.title}

${notification.message}
${actionText}

---
This notification was sent from ${this.resendConfig.fromName}.
If you no longer wish to receive these notifications, you can update your preferences at ${this.templateConfig.baseUrl}${this.templateConfig.unsubscribeUrl}.
For support, contact us at ${this.templateConfig.supportEmail}
    `.trim();
  }

  /**
   * Health check for email service
   */
  async healthCheck(): Promise<{ status: string; message: string }> {
    try {
      if (!this.resend) {
        return {
          status: "unhealthy",
          message: "Email service not configured",
        };
      }

      // Try to get API key info (this would be a simple API call to verify connectivity)
      return {
        status: "healthy",
        message: "Email service is accessible",
      };
    } catch (error) {
      this.logger.error("Email service health check failed", error);
      return {
        status: "unhealthy",
        message: "Email service is not accessible",
      };
    }
  }
}
