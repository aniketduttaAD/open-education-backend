import { ConfigService } from "@nestjs/config";

export interface ResendConfig {
  apiKey: string;
  fromEmail: string;
  fromName: string;
  replyTo?: string;
}

export const getResendConfig = (configService: ConfigService): ResendConfig => {
  const apiKey = configService.get<string>("RESEND_API_KEY");
  const fromEmail = "OpenEducation <onboarding@resend.dev>"; // Hardcoded

  if (!apiKey) {
    throw new Error("RESEND_API_KEY is required for email notifications");
  }

  // Parse fromEmail to extract name and email
  const emailMatch = fromEmail.match(/^(.+?)\s*<(.+?)>$/);
  const fromName = emailMatch ? emailMatch[1].trim() : "OpenEducation";
  const email = emailMatch ? emailMatch[2].trim() : fromEmail;

  return {
    apiKey,
    fromEmail: email,
    fromName,
    replyTo: "helloaniketdutta@gmail.com", // Hardcoded support email
  };
};

export interface EmailTemplateConfig {
  baseUrl: string;
  supportEmail: string;
  unsubscribeUrl: string;
}

export const getEmailTemplateConfig = (configService: ConfigService): EmailTemplateConfig => ({
  baseUrl: "https://openeducation.vercel.app", // Hardcoded
  supportEmail: "helloaniketdutta@gmail.com", // Hardcoded support email
  unsubscribeUrl: "/notifications/preferences",
});

export default getResendConfig;
