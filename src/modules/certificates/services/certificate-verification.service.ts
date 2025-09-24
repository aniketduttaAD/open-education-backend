import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Certificate, CertificateStatus } from '../entities/certificate.entity';
import { CertificateVerificationLog, VerificationStatus } from '../entities/certificate-verification-log.entity';
import { VerifyCertificateDto } from '../dto/verify-certificate.dto';

/**
 * Certificate verification service
 * Handles certificate verification and anti-fraud measures
 */
@Injectable()
export class CertificateVerificationService {
  private readonly logger = new Logger(CertificateVerificationService.name);

  constructor(
    @InjectRepository(Certificate)
    private readonly certificateRepository: Repository<Certificate>,
    @InjectRepository(CertificateVerificationLog)
    private readonly verificationLogRepository: Repository<CertificateVerificationLog>,
  ) {}

  /**
   * Verify a certificate
   */
  async verifyCertificate(
    verifyDto: VerifyCertificateDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{
    isValid: boolean;
    certificate?: Certificate;
    status: VerificationStatus;
    message: string;
  }> {
    const { certificateNumber } = verifyDto;

    try {
      // Find certificate
      const certificate = await this.certificateRepository.findOne({
        where: { certificateNumber },
        relations: ['user', 'course'],
      });

      if (!certificate) {
        await this.logVerificationAttempt(
          null,
          VerificationStatus.FAILED,
          'Certificate not found',
          ipAddress,
          userAgent,
        );

        return {
          isValid: false,
          status: VerificationStatus.FAILED,
          message: 'Certificate not found',
        };
      }

      // Check certificate status
      if (certificate.isRevoked()) {
        await this.logVerificationAttempt(
          certificate,
          VerificationStatus.REVOKED,
          'Certificate has been revoked',
          ipAddress,
          userAgent,
        );

        return {
          isValid: false,
          certificate,
          status: VerificationStatus.REVOKED,
          message: 'Certificate has been revoked',
        };
      }

      // Check if certificate is expired
      if (certificate.isExpired()) {
        await this.logVerificationAttempt(
          certificate,
          VerificationStatus.EXPIRED,
          'Certificate has expired',
          ipAddress,
          userAgent,
        );

        return {
          isValid: false,
          certificate,
          status: VerificationStatus.EXPIRED,
          message: 'Certificate has expired',
        };
      }

      // Check if certificate is generated
      if (!certificate.isGenerated()) {
        await this.logVerificationAttempt(
          certificate,
          VerificationStatus.FAILED,
          'Certificate is not yet generated',
          ipAddress,
          userAgent,
        );

        return {
          isValid: false,
          certificate,
          status: VerificationStatus.FAILED,
          message: 'Certificate is not yet generated',
        };
      }

      // Certificate is valid
      await this.logVerificationAttempt(
        certificate,
        VerificationStatus.SUCCESS,
        'Certificate verified successfully',
        ipAddress,
        userAgent,
      );

      return {
        isValid: true,
        certificate,
        status: VerificationStatus.SUCCESS,
        message: 'Certificate is valid',
      };
    } catch (error) {
      this.logger.error('Certificate verification error', error);
      
      await this.logVerificationAttempt(
        null,
        VerificationStatus.FAILED,
        'Verification error occurred',
        ipAddress,
        userAgent,
      );

      return {
        isValid: false,
        status: VerificationStatus.FAILED,
        message: 'Verification error occurred',
      };
    }
  }

  /**
   * Get certificate verification history
   */
  async getVerificationHistory(certificateId: string): Promise<CertificateVerificationLog[]> {
    return this.verificationLogRepository.find({
      where: { certificateId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Revoke a certificate
   */
  async revokeCertificate(certificateId: string, reason: string): Promise<Certificate> {
    const certificate = await this.certificateRepository.findOne({
      where: { id: certificateId },
    });

    if (!certificate) {
      throw new NotFoundException('Certificate not found');
    }

    certificate.status = CertificateStatus.REVOKED;
    certificate.metadata = {
      ...certificate.metadata,
      revocationReason: reason,
      revokedAt: new Date().toISOString(),
    };

    const revokedCertificate = await this.certificateRepository.save(certificate);
    this.logger.log(`Certificate revoked: ${certificate.certificateNumber}`);

    return revokedCertificate;
  }

  /**
   * Get certificate statistics
   */
  async getCertificateStats(): Promise<{
    total: number;
    generated: number;
    verified: number;
    revoked: number;
    expired: number;
  }> {
    const [total, generated, verified, revoked] = await Promise.all([
      this.certificateRepository.count(),
      this.certificateRepository.count({ where: { status: CertificateStatus.GENERATED } }),
      this.certificateRepository.count({ where: { status: CertificateStatus.VERIFIED } }),
      this.certificateRepository.count({ where: { status: CertificateStatus.REVOKED } }),
    ]);

    const expired = await this.certificateRepository
      .createQueryBuilder('certificate')
      .where('certificate.expiryDate < :now', { now: new Date() })
      .andWhere('certificate.status != :revoked', { revoked: CertificateStatus.REVOKED })
      .getCount();

    return {
      total,
      generated,
      verified,
      revoked,
      expired,
    };
  }

  /**
   * Log verification attempt
   */
  private async logVerificationAttempt(
    certificate: Certificate | null,
    status: VerificationStatus,
    failureReason: string | null,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<void> {
    const log = this.verificationLogRepository.create({
      certificateId: certificate?.id || '',
      status,
      failureReason: failureReason || undefined,
      ipAddress,
      userAgent,
      metadata: {
        certificateNumber: certificate?.certificateNumber,
        timestamp: new Date().toISOString(),
      },
    });

    await this.verificationLogRepository.save(log);
  }

  /**
   * Anti-fraud measures
   */
  async performAntiFraudChecks(certificate: Certificate): Promise<{
    isFraudulent: boolean;
    riskScore: number;
    reasons: string[];
  }> {
    const reasons: string[] = [];
    let riskScore = 0;

    // Check for suspicious patterns
    const verificationLogs = await this.getVerificationHistory(certificate.id);
    
    // High frequency verification attempts
    const recentVerifications = verificationLogs.filter(
      log => new Date().getTime() - log.createdAt.getTime() < 24 * 60 * 60 * 1000 // Last 24 hours
    );

    if (recentVerifications.length > 10) {
      riskScore += 30;
      reasons.push('High frequency verification attempts');
    }

    // Multiple failed verifications
    const failedVerifications = verificationLogs.filter(
      log => log.status === VerificationStatus.FAILED
    );

    if (failedVerifications.length > 5) {
      riskScore += 20;
      reasons.push('Multiple failed verification attempts');
    }

    // Certificate age check
    const certificateAge = new Date().getTime() - certificate.createdAt.getTime();
    const ageInDays = certificateAge / (1000 * 60 * 60 * 24);

    if (ageInDays < 1) {
      riskScore += 15;
      reasons.push('Certificate created very recently');
    }

    // Check for duplicate certificate numbers (should not happen with our system)
    const duplicateCheck = await this.certificateRepository.count({
      where: { certificateNumber: certificate.certificateNumber },
    });

    if (duplicateCheck > 1) {
      riskScore += 50;
      reasons.push('Duplicate certificate number detected');
    }

    return {
      isFraudulent: riskScore > 50,
      riskScore,
      reasons,
    };
  }
}
