import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as QRCode from 'qrcode';
import * as fs from 'fs-extra';
import * as path from 'path';
const PDFDocument = require('pdfkit');
import { Certificate, CertificateStatus } from '../entities/certificate.entity';
import { User } from '../../auth/entities/user.entity';
import { Course } from '../../courses/entities/course.entity';
import { GenerateCertificateDto } from '../dto/generate-certificate.dto';

/**
 * Certificate generation service
 * Handles certificate creation, QR code generation, and PDF generation
 */
@Injectable()
export class CertificateGenerationService {
  private readonly logger = new Logger(CertificateGenerationService.name);
  private readonly uploadPath: string;

  constructor(
    @InjectRepository(Certificate)
    private readonly certificateRepository: Repository<Certificate>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Course)
    private readonly courseRepository: Repository<Course>,
    private readonly configService: ConfigService,
  ) {
    // Use MinIO for file storage instead of local uploads
    this.uploadPath = 'certificates';
  }

  /**
   * Generate a new certificate
   */
  async generateCertificate(
    userId: string,
    courseId: string,
    generateDto: GenerateCertificateDto,
  ): Promise<Certificate> {
    // Verify user and course exist
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const course = await this.courseRepository.findOne({ where: { id: courseId } });
    if (!course) {
      throw new NotFoundException('Course not found');
    }

    // Check if certificate already exists
    const existingCertificate = await this.certificateRepository.findOne({
      where: { userId, courseId },
    });

    if (existingCertificate) {
      throw new Error('Certificate already exists for this user and course');
    }

    // Generate unique certificate number
    const certificateNumber = await this.generateCertificateNumber();

    // Create certificate record
    const certificate = this.certificateRepository.create({
      certificateNumber,
      title: generateDto.title,
      description: generateDto.description,
      issuerName: generateDto.issuerName || 'OpenEducation Platform',
      issuerLogo: generateDto.issuerLogo,
      issueDate: generateDto.issueDate ? new Date(generateDto.issueDate) : new Date(),
      expiryDate: generateDto.expiryDate ? new Date(generateDto.expiryDate) : undefined,
      metadata: generateDto.metadata,
      userId,
      courseId,
      status: CertificateStatus.PENDING,
    });

    const savedCertificate = await this.certificateRepository.save(certificate);

    // Generate QR code and certificate files
    await this.generateCertificateFiles(savedCertificate);

    // Update status to generated
    savedCertificate.status = CertificateStatus.GENERATED;
    await this.certificateRepository.save(savedCertificate);

    this.logger.log(`Certificate generated: ${savedCertificate.certificateNumber}`);
    return savedCertificate;
  }

  /**
   * Generate certificate files (QR code, PDF, etc.)
   */
  private async generateCertificateFiles(certificate: Certificate): Promise<void> {
    try {
      // Generate QR code
      const qrCodeData = certificate.getQrCodeData();
      const qrCodePath = path.join(this.uploadPath, `${certificate.certificateNumber}_qr.png`);
      await QRCode.toFile(qrCodePath, qrCodeData, {
        width: 200,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF',
        },
      });

      // Update certificate with QR code URL
      certificate.qrCodeUrl = `/certificates/qr/${certificate.certificateNumber}`;

      // Generate certificate PDF (placeholder - would use a PDF generation library)
      const certificatePath = path.join(this.uploadPath, `${certificate.certificateNumber}.pdf`);
      await this.generateCertificatePDF(certificate, certificatePath);

      // Update certificate with PDF URL
      certificate.certificateUrl = `/certificates/download/${certificate.certificateNumber}`;

      await this.certificateRepository.save(certificate);
    } catch (error) {
      this.logger.error('Failed to generate certificate files', error);
      throw new Error('Failed to generate certificate files');
    }
  }

  /**
   * Generate certificate PDF using PDFKit
   */
  private async generateCertificatePDF(certificate: Certificate, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Create a new PDF document
        const doc = new PDFDocument({
          size: 'A4',
          layout: 'landscape',
          margins: {
            top: 50,
            bottom: 50,
            left: 50,
            right: 50,
          },
        });

        // Pipe the PDF to a file
        const stream = fs.createWriteStream(outputPath);
        doc.pipe(stream);

        // Certificate background and border
        doc.rect(0, 0, doc.page.width, doc.page.height)
           .lineWidth(3)
           .stroke('#2c3e50');

        // Inner border
        doc.rect(20, 20, doc.page.width - 40, doc.page.height - 40)
           .lineWidth(2)
           .stroke('#34495e');

        // Title
        doc.fontSize(36)
           .fillColor('#2c3e50')
           .text('CERTIFICATE OF COMPLETION', doc.page.width / 2, 80, {
             align: 'center',
             underline: true,
           });

        // Subtitle
        doc.fontSize(18)
           .fillColor('#7f8c8d')
           .text('This is to certify that', doc.page.width / 2, 140, {
             align: 'center',
           });

        // Student name
        doc.fontSize(28)
           .fillColor('#2c3e50')
           .text(certificate.user?.name || 'Student Name', doc.page.width / 2, 180, {
             align: 'center',
             bold: true,
           });

        // Course completion text
        doc.fontSize(16)
           .fillColor('#34495e')
           .text('has successfully completed the course', doc.page.width / 2, 220, {
             align: 'center',
           });

        // Course title
        doc.fontSize(20)
           .fillColor('#2c3e50')
           .text(certificate.course?.title || 'Course Title', doc.page.width / 2, 250, {
             align: 'center',
             bold: true,
           });

        // Certificate details
        const detailsY = 320;
        doc.fontSize(14)
           .fillColor('#7f8c8d')
           .text(`Certificate Number: ${certificate.certificateNumber}`, 100, detailsY)
           .text(`Issue Date: ${certificate.issueDate?.toLocaleDateString() || new Date().toLocaleDateString()}`, 100, detailsY + 25)
           .text(`Issued by: ${certificate.issuerName}`, 100, detailsY + 50);

        // QR Code placeholder (will be generated separately)
        doc.fontSize(12)
           .fillColor('#95a5a6')
           .text('Verification QR Code', doc.page.width - 200, detailsY)
           .rect(doc.page.width - 200, detailsY + 20, 100, 100)
           .stroke('#bdc3c7');

        // Footer
        doc.fontSize(10)
           .fillColor('#95a5a6')
           .text('This certificate is digitally verified and can be verified online', 
                 doc.page.width / 2, doc.page.height - 80, {
             align: 'center',
           });

        // Finalize the PDF
        doc.end();

        stream.on('finish', () => {
          this.logger.log(`Certificate PDF generated successfully: ${outputPath}`);
          resolve();
        });

        stream.on('error', (error) => {
          this.logger.error(`Error generating certificate PDF: ${error}`);
          reject(error);
        });

      } catch (error) {
        this.logger.error(`Error creating PDF document: ${error}`);
        reject(error);
      }
    });
  }

  /**
   * Generate unique certificate number
   */
  private async generateCertificateNumber(): Promise<string> {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    const certificateNumber = `CERT-${timestamp}-${random}`;

    // Check if certificate number already exists
    const existing = await this.certificateRepository.findOne({
      where: { certificateNumber },
    });

    if (existing) {
      // Recursively generate new number if collision
      return this.generateCertificateNumber();
    }

    return certificateNumber;
  }


  /**
   * Get certificate file path
   */
  getCertificateFilePath(certificateNumber: string, type: 'qr' | 'pdf' | 'txt'): string {
    const extension = type === 'qr' ? 'png' : type === 'pdf' ? 'pdf' : 'txt';
    return path.join(this.uploadPath, `${certificateNumber}${type === 'qr' ? '_qr' : ''}.${extension}`);
  }

  /**
   * Check if certificate file exists
   */
  async certificateFileExists(certificateNumber: string, type: 'qr' | 'pdf' | 'txt'): Promise<boolean> {
    const filePath = this.getCertificateFilePath(certificateNumber, type);
    return fs.pathExists(filePath);
  }

  /**
   * Read certificate file
   */
  async readCertificateFile(certificateNumber: string, type: 'qr' | 'pdf' | 'txt'): Promise<Buffer> {
    const filePath = this.getCertificateFilePath(certificateNumber, type);
    const exists = await fs.pathExists(filePath);
    
    if (!exists) {
      throw new NotFoundException('Certificate file not found');
    }

    return fs.readFile(filePath);
  }

  /**
   * Get course completion certificates
   */
  async getCourseCompletionCertificates(
    tutorId: string,
    studentId?: string,
    courseId?: string,
    page: number = 1,
    limit: number = 10,
  ) {
    const query = this.certificateRepository
      .createQueryBuilder('certificate')
      .leftJoinAndSelect('certificate.enrollment', 'enrollment')
      .leftJoinAndSelect('enrollment.course', 'course')
      .leftJoinAndSelect('enrollment.student', 'student')
      .where('course.tutor_id = :tutorId', { tutorId });

    if (studentId) {
      query.andWhere('enrollment.student_id = :studentId', { studentId });
    }

    if (courseId) {
      query.andWhere('enrollment.course_id = :courseId', { courseId });
    }

    const [certificates, total] = await query
      .orderBy('certificate.issued_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      certificates,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get a single course completion certificate
   */
  async getCourseCompletionCertificate(
    certificateId: string,
    tutorId: string,
  ) {
    const certificate = await this.certificateRepository
      .createQueryBuilder('certificate')
      .leftJoinAndSelect('certificate.enrollment', 'enrollment')
      .leftJoinAndSelect('enrollment.course', 'course')
      .leftJoinAndSelect('enrollment.student', 'student')
      .where('certificate.id = :certificateId', { certificateId })
      .andWhere('course.tutor_id = :tutorId', { tutorId })
      .getOne();

    if (!certificate) {
      throw new NotFoundException('Certificate not found');
    }

    return certificate;
  }

  /**
   * Verify course completion certificate
   */
  async verifyCourseCompletionCertificate(
    userId: string,
    courseId: string,
  ): Promise<Certificate | null> {
    try {
      const certificate = await this.certificateRepository.findOne({
        where: {
          userId,
          courseId,
          status: CertificateStatus.GENERATED,
        },
        relations: ['user', 'course'],
      });

      return certificate;
    } catch (error) {
      this.logger.error(`Failed to verify course completion certificate for user ${userId}, course ${courseId}:`, error);
      throw new NotFoundException('Certificate verification failed');
    }
  }
}
