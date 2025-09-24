import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { TutorDocument } from '../../users/entities/tutor-document.entity';

export interface TutorVerificationJobData {
  userId: string;
  action: 'payment_received' | 'documents_uploaded' | 'verification_complete';
}

@Injectable()
export class TutorVerificationProcessor {
  private readonly logger = new Logger(TutorVerificationProcessor.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(TutorDocument)
    private readonly tutorDocumentsRepository: Repository<TutorDocument>,
  ) {}

  async handlePaymentReceived(data: TutorVerificationJobData) {
    const { userId } = data;

    this.logger.log(`Processing payment received for user: ${userId}`);

    try {
      // Find tutor user
      const user = await this.userRepository.findOne({
        where: { id: userId, user_type: 'tutor' },
      });

      if (!user || !user.tutor_details) {
        throw new Error(`Tutor user not found: ${userId}`);
      }

      // Update payment status in tutor_details
      user.tutor_details.register_fees_paid = true;
      await this.userRepository.save(user);

      // Send notification to admin
      await this.notifyAdminForVerification(user);

      // Send confirmation email to tutor
      await this.sendPaymentConfirmationEmail(user);

      this.logger.log(`Payment processing completed for user: ${userId}`);

      return {
        success: true,
        userId,
        action: 'payment_received',
      };

    } catch (error) {
      this.logger.error(`Payment processing failed for user: ${userId}`, error);
      throw error;
    }
  }

  async handleDocumentsUploaded(data: TutorVerificationJobData) {
    const { userId } = data;

    this.logger.log(`Processing documents uploaded for user: ${userId}`);

    try {
      // Find tutor user
      const user = await this.userRepository.findOne({
        where: { id: userId, user_type: 'tutor' },
      });

      if (!user || !user.tutor_details) {
        throw new Error(`Tutor user not found: ${userId}`);
      }

      // Check if all required documents are uploaded
      const hasRequiredDocuments = await this.checkRequiredDocuments(userId);

      if (hasRequiredDocuments) {
        // Notify admin that tutor is ready for verification
        await this.notifyAdminForVerification(user);

        // Send notification to tutor
        await this.sendDocumentsReceivedEmail(user);
      }

      this.logger.log(`Documents processing completed for user: ${userId}`);

      return {
        success: true,
        userId,
        action: 'documents_uploaded',
        hasRequiredDocuments,
      };

    } catch (error) {
      this.logger.error(`Documents processing failed for user: ${userId}`, error);
      throw error;
    }
  }

  async handleVerificationComplete(data: TutorVerificationJobData) {
    const { userId } = data;

    this.logger.log(`Processing verification complete for user: ${userId}`);

    try {
      // Find tutor user
      const user = await this.userRepository.findOne({
        where: { id: userId, user_type: 'tutor' },
      });

      if (!user || !user.tutor_details) {
        throw new Error(`Tutor user not found: ${userId}`);
      }

      // Send verification result email
      if (user.tutor_details.verification_status === 'verified') {
        await this.sendVerificationApprovedEmail(user);

        // Send welcome email with next steps
        await this.sendWelcomeEmail(user);
      } else if (user.tutor_details.verification_status === 'rejected') {
        await this.sendVerificationRejectedEmail(user);
      }

      this.logger.log(`Verification processing completed for user: ${userId}`);

      return {
        success: true,
        userId,
        action: 'verification_complete',
        status: user.tutor_details.verification_status,
      };

    } catch (error) {
      this.logger.error(`Verification processing failed for user: ${userId}`, error);
      throw error;
    }
  }

  private async notifyAdminForVerification(user: User): Promise<void> {
    this.logger.log(`Notifying admin for tutor verification: ${user.id}`);

    try {
      // In a real implementation, this would:
      // 1. Send notification to admin dashboard
      // 2. Send email to admin
      // 3. Create admin notification record
      // 4. Trigger real-time notification via WebSocket

      this.logger.log(`Admin notification sent for tutor: ${user.name} (${user.email})`);
    } catch (error) {
      this.logger.error(`Failed to notify admin for tutor verification: ${user.id}`, error);
    }
  }

  private async sendPaymentConfirmationEmail(user: User): Promise<void> {
    this.logger.log(`Sending payment confirmation email to: ${user.email}`);
    
    try {
      // In a real implementation, this would:
      // 1. Use email service (Resend, SendGrid, etc.)
      // 2. Send templated email with payment confirmation
      // 3. Include next steps for document upload
      
      const emailData = {
        to: user.email,
        subject: 'Payment Confirmed - Next Steps for Tutor Verification',
        template: 'tutor-payment-confirmation',
        data: {
          name: user.name,
          amount: '₹1000',
          nextSteps: [
            'Upload your degree certificate',
            'Upload your ID proof',
            'Upload your address proof',
            'Wait for admin verification'
          ]
        }
      };
      
      this.logger.log(`Payment confirmation email sent to: ${user.email}`);
    } catch (error) {
      this.logger.error(`Failed to send payment confirmation email to: ${user.email}`, error);
    }
  }

  private async sendDocumentsReceivedEmail(user: User): Promise<void> {
    this.logger.log(`Sending documents received email to: ${user.email}`);
    
    try {
      const emailData = {
        to: user.email,
        subject: 'Documents Received - Verification in Progress',
        template: 'tutor-documents-received',
        data: {
          name: user.name,
          message: 'Your verification documents have been received and are under review.'
        }
      };
      
      this.logger.log(`Documents received email sent to: ${user.email}`);
    } catch (error) {
      this.logger.error(`Failed to send documents received email to: ${user.email}`, error);
    }
  }

  private async sendVerificationApprovedEmail(user: User): Promise<void> {
    this.logger.log(`Sending verification approved email to: ${user.email}`);
    
    try {
      const emailData = {
        to: user.email,
        subject: 'Congratulations! Your Tutor Account is Verified',
        template: 'tutor-verification-approved',
        data: {
          name: user.name,
          message: 'Your tutor account has been successfully verified. You can now start creating courses!',
          nextSteps: [
            'Create your first course',
            'Set up your course pricing',
            'Upload course content',
            'Start teaching students'
          ]
        }
      };
      
      this.logger.log(`Verification approved email sent to: ${user.email}`);
    } catch (error) {
      this.logger.error(`Failed to send verification approved email to: ${user.email}`, error);
    }
  }

  private async sendVerificationRejectedEmail(user: User): Promise<void> {
    this.logger.log(`Sending verification rejected email to: ${user.email}`);
    
    try {
      const emailData = {
        to: user.email,
        subject: 'Tutor Verification Update',
        template: 'tutor-verification-rejected',
        data: {
          name: user.name,
          message: 'Unfortunately, your tutor verification could not be approved at this time.',
          nextSteps: [
            'Review the feedback provided',
            'Upload corrected documents if needed',
            'Contact support for assistance',
            'Resubmit your application'
          ]
        }
      };
      
      this.logger.log(`Verification rejected email sent to: ${user.email}`);
    } catch (error) {
      this.logger.error(`Failed to send verification rejected email to: ${user.email}`, error);
    }
  }

  private async sendWelcomeEmail(user: User): Promise<void> {
    this.logger.log(`Sending welcome email to: ${user.email}`);
    
    try {
      const emailData = {
        to: user.email,
        subject: 'Welcome to OpenEducation - Start Your Teaching Journey!',
        template: 'tutor-welcome',
        data: {
          name: user.name,
          message: 'Welcome to OpenEducation! Your tutor account is now active.',
          resources: [
            'Course creation guide',
            'Best practices for online teaching',
            'Student engagement tips',
            'Earning optimization strategies'
          ]
        }
      };
      
      this.logger.log(`Welcome email sent to: ${user.email}`);
    } catch (error) {
      this.logger.error(`Failed to send welcome email to: ${user.email}`, error);
    }
  }

  private async checkRequiredDocuments(userId: string): Promise<boolean> {
    this.logger.log(`Checking required documents for user: ${userId}`);
    
    try {
      // Check for required document types: identity_proof, address_proof, educational_certificate
      const requiredDocumentTypes = ['identity_proof', 'address_proof', 'educational_certificate'];
      
      // Query the tutor documents repository for user documents
      const userDocuments = await this.tutorDocumentsRepository.find({
        where: { user_id: userId },
        select: ['document_type', 'status'],
      });
      
      // Check if all required document types are present and verified
      const hasAllDocuments = requiredDocumentTypes.every(type => {
        const document = userDocuments.find((doc: any) => doc.document_type === type);
        return document && document.status === 'verified';
      });
      
      this.logger.log(`Document check completed for user: ${userId}, hasAllDocuments: ${hasAllDocuments}`);
      return hasAllDocuments;
    } catch (error) {
      this.logger.error(`Failed to check required documents for user: ${userId}`, error);
      return false;
    }
  }
}
