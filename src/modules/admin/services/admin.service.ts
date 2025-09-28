import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { TutorDocumentsService } from '../../users/services/tutor-documents.service';
import { QueueService } from '../../queue/services/queue.service';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private tutorDocumentsService: TutorDocumentsService,
    private queueService: QueueService,
  ) {}

  /**
   * Approve tutor verification
   */
  async approveTutor(tutorId: string, adminId: string) {
    this.logger.log(`Approving tutor verification: ${tutorId} by admin: ${adminId}`);

    const tutor = await this.userRepository.findOne({
      where: { id: tutorId, user_type: 'tutor' },
    });

    if (!tutor) {
      throw new NotFoundException('Tutor not found');
    }

    if (!tutor.tutor_details) {
      throw new BadRequestException('Tutor details not found');
    }

    if (tutor.document_verification === 'verified') {
      throw new BadRequestException('Tutor is already verified');
    }

    if (tutor.document_verification === 'rejected') {
      throw new BadRequestException('Cannot approve a rejected tutor. Please contact support.');
    }

    // Update document verification status
    tutor.document_verification = 'verified';
    tutor.tutor_details.verification_status = 'verified';
    tutor.tutor_details.register_fees_paid = true;

    await this.userRepository.save(tutor);

    // Queue verification complete job
    await this.queueService.queueTutorVerification({
      userId: tutorId,
      action: 'verification_complete',
    });

    this.logger.log(`Tutor verification approved: ${tutorId}`);

    return {
      tutorId,
      status: 'verified',
      approvedBy: adminId,
      approvedAt: new Date().toISOString(),
    };
  }

  /**
   * Reject tutor verification
   */
  async rejectTutor(tutorId: string, reason: string, adminId: string) {
    this.logger.log(`Rejecting tutor verification: ${tutorId} by admin: ${adminId}`);

    const tutor = await this.userRepository.findOne({
      where: { id: tutorId, user_type: 'tutor' },
    });

    if (!tutor) {
      throw new NotFoundException('Tutor not found');
    }

    if (!tutor.tutor_details) {
      throw new BadRequestException('Tutor details not found');
    }

    if (tutor.document_verification === 'verified') {
      throw new BadRequestException('Cannot reject an already verified tutor');
    }

    if (tutor.document_verification === 'rejected') {
      throw new BadRequestException('Tutor is already rejected');
    }

    // Update document verification status
    tutor.document_verification = 'rejected';
    tutor.tutor_details.verification_status = 'rejected';

    await this.userRepository.save(tutor);

    // Queue verification complete job
    await this.queueService.queueTutorVerification({
      userId: tutorId,
      action: 'verification_complete',
    });

    this.logger.log(`Tutor verification rejected: ${tutorId}, reason: ${reason}`);

    return {
      tutorId,
      status: 'rejected',
      reason,
      rejectedBy: adminId,
      rejectedAt: new Date().toISOString(),
    };
  }

  /**
   * Get tutors pending verification
   */
  async getPendingVerifications(page: number = 1, limit: number = 10) {
    this.logger.log(`Getting pending verifications - page: ${page}, limit: ${limit}`);

    const [tutors, total] = await this.userRepository.findAndCount({
      where: {
        user_type: 'tutor',
        document_verification: 'pending',
      },
      skip: (page - 1) * limit,
      take: limit,
      order: { created_at: 'DESC' },
    });

    // Get document counts for each tutor
    const tutorsWithDocuments = await Promise.all(
      tutors.map(async (tutor) => {
        const documents = await this.tutorDocumentsService.getTutorDocuments(tutor.id);
        const verificationRequirements = await this.tutorDocumentsService.checkVerificationRequirements(tutor.id);
        
        return {
          id: tutor.id,
          name: tutor.name,
          email: tutor.email,
          image: tutor.image,
          created_at: tutor.created_at,
          tutor_details: tutor.tutor_details,
          document_count: documents.length,
          has_required_documents: verificationRequirements.hasRequiredDocuments,
          missing_documents: verificationRequirements.missingDocuments,
          uploaded_documents: verificationRequirements.uploadedDocuments,
        };
      })
    );

    return {
      tutors: tutorsWithDocuments,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get verification statistics
   */
  async getVerificationStats() {
    this.logger.log('Getting verification statistics');

    const [total, pending, verified, rejected] = await Promise.all([
      this.userRepository.count({ where: { user_type: 'tutor' } }),
      this.userRepository.count({ where: { user_type: 'tutor', document_verification: 'pending' } }),
      this.userRepository.count({ where: { user_type: 'tutor', document_verification: 'verified' } }),
      this.userRepository.count({ where: { user_type: 'tutor', document_verification: 'rejected' } }),
    ]);

    return {
      total,
      pending,
      verified,
      rejected,
      verification_rate: total > 0 ? ((verified / total) * 100).toFixed(2) : '0.00',
    };
  }
}
