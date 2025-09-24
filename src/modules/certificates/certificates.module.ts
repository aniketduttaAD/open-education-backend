import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CertificatesController } from './certificates.controller';
import { CertificateGenerationService } from './services/certificate-generation.service';
import { CertificateVerificationService } from './services/certificate-verification.service';
import { Certificate, CertificateVerificationLog, CourseCompletionCertificate } from './entities';
import { User } from '../auth/entities/user.entity';
import { Course } from '../courses/entities/course.entity';

/**
 * Certificates module for certificate management and verification
 * Handles certificate generation, QR codes, and anti-fraud measures
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Certificate, CertificateVerificationLog, CourseCompletionCertificate, User, Course]),
  ],
  controllers: [CertificatesController],
  providers: [CertificateGenerationService, CertificateVerificationService],
  exports: [CertificateGenerationService, CertificateVerificationService],
})
export class CertificatesModule {}
