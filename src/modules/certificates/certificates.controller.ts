import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  Res,
  Req,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Response, Request } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { CertificateGenerationService } from './services/certificate-generation.service';
import { CertificateVerificationService } from './services/certificate-verification.service';
import { GenerateCertificateDto } from './dto/generate-certificate.dto';
import { VerifyCertificateDto } from './dto/verify-certificate.dto';

/**
 * Certificates controller for certificate management and verification
 * Handles certificate generation, verification, and anti-fraud measures
 */
@ApiTags('Certificates')
@Controller('certificates')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class CertificatesController {
  constructor(
    private readonly certificateGenerationService: CertificateGenerationService,
    private readonly certificateVerificationService: CertificateVerificationService,
  ) {}

  @Post('generate')
  @UseGuards(RolesGuard)
  @Roles('admin', 'tutor')
  @ApiOperation({ summary: 'Generate a new certificate (admin/tutor only)' })
  @ApiResponse({ status: 201, description: 'Certificate generated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid certificate data' })
  async generateCertificate(
    @CurrentUser() user: JwtPayload,
    @Body() generateDto: GenerateCertificateDto,
    @Query('courseId') courseId: string,
    @Query('userId') userId: string,
  ) {
    const certificate = await this.certificateGenerationService.generateCertificate(
      userId,
      courseId,
      generateDto,
    );

    return {
      success: true,
      data: certificate,
      message: 'Certificate generated successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('verify')
  @Public()
  @ApiOperation({ summary: 'Verify a certificate (public endpoint)' })
  @ApiResponse({ status: 200, description: 'Certificate verification result' })
  @ApiResponse({ status: 404, description: 'Certificate not found' })
  async verifyCertificate(
    @Query('certificateNumber') certificateNumber: string,
    @Req() req: Request,
  ) {
    const verification = await this.certificateVerificationService.verifyCertificate(
      { certificateNumber },
      req.ip,
      req.get('User-Agent'),
    );

    return {
      success: true,
      data: verification,
      message: 'Certificate verification completed',
      timestamp: new Date().toISOString(),
    };
  }

  @Post('verify')
  @Public()
  @ApiOperation({ summary: 'Verify a certificate with POST (public endpoint)' })
  @ApiResponse({ status: 200, description: 'Certificate verification result' })
  @ApiResponse({ status: 404, description: 'Certificate not found' })
  async verifyCertificatePost(
    @Body() verifyDto: VerifyCertificateDto,
    @Req() req: Request,
  ) {
    const verification = await this.certificateVerificationService.verifyCertificate(
      verifyDto,
      req.ip,
      req.get('User-Agent'),
    );

    return {
      success: true,
      data: verification,
      message: 'Certificate verification completed',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('verify/:certificateNumber')
  @Public()
  @ApiOperation({ summary: 'Verify a certificate by number (public endpoint)' })
  @ApiResponse({ status: 200, description: 'Certificate verification result' })
  @ApiResponse({ status: 404, description: 'Certificate not found' })
  async verifyCertificateByNumber(
    @Param('certificateNumber') certificateNumber: string,
    @Req() req: Request,
  ) {
    const verification = await this.certificateVerificationService.verifyCertificate(
      { certificateNumber },
      req.ip,
      req.get('User-Agent'),
    );

    return {
      success: true,
      data: verification,
      message: 'Certificate verification completed',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('qr/:certificateNumber')
  @Public()
  @ApiOperation({ summary: 'Get certificate QR code (public endpoint)' })
  @ApiResponse({ status: 200, description: 'QR code image' })
  @ApiResponse({ status: 404, description: 'QR code not found' })
  async getCertificateQRCode(
    @Param('certificateNumber') certificateNumber: string,
    @Res() res: Response,
  ) {
    try {
      const qrCodeBuffer = await this.certificateGenerationService.readCertificateFile(
        certificateNumber,
        'qr',
      );

      res.set({
        'Content-Type': 'image/png',
        'Content-Length': qrCodeBuffer.length.toString(),
        'Cache-Control': 'public, max-age=31536000', // 1 year cache
      });

      res.send(qrCodeBuffer);
    } catch (error) {
      throw new NotFoundException('QR code not found');
    }
  }

  @Get('download/:certificateNumber')
  @Public()
  @ApiOperation({ summary: 'Download certificate PDF (public endpoint)' })
  @ApiResponse({ status: 200, description: 'Certificate PDF' })
  @ApiResponse({ status: 404, description: 'Certificate not found' })
  async downloadCertificate(
    @Param('certificateNumber') certificateNumber: string,
    @Res() res: Response,
  ) {
    try {
      const certificateBuffer = await this.certificateGenerationService.readCertificateFile(
        certificateNumber,
        'txt', // Using txt as placeholder for PDF
      );

      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="certificate-${certificateNumber}.pdf"`,
        'Content-Length': certificateBuffer.length.toString(),
      });

      res.send(certificateBuffer);
    } catch (error) {
      throw new NotFoundException('Certificate not found');
    }
  }

  @Get('stats')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Get certificate statistics (admin only)' })
  @ApiResponse({ status: 200, description: 'Certificate statistics retrieved successfully' })
  async getCertificateStats(@CurrentUser() user: JwtPayload) {
    const stats = await this.certificateVerificationService.getCertificateStats();
    return {
      success: true,
      data: stats,
      message: 'Certificate statistics retrieved successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Put('revoke/:certificateId')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Revoke a certificate (admin only)' })
  @ApiResponse({ status: 200, description: 'Certificate revoked successfully' })
  @ApiResponse({ status: 404, description: 'Certificate not found' })
  async revokeCertificate(
    @CurrentUser() user: JwtPayload,
    @Param('certificateId') certificateId: string,
    @Body('reason') reason: string,
  ) {
    const certificate = await this.certificateVerificationService.revokeCertificate(
      certificateId,
      reason,
    );

    return {
      success: true,
      data: certificate,
      message: 'Certificate revoked successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('verification-history/:certificateId')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Get certificate verification history (admin only)' })
  @ApiResponse({ status: 200, description: 'Verification history retrieved successfully' })
  async getVerificationHistory(
    @CurrentUser() user: JwtPayload,
    @Param('certificateId') certificateId: string,
  ) {
    const history = await this.certificateVerificationService.getVerificationHistory(
      certificateId,
    );

    return {
      success: true,
      data: history,
      message: 'Verification history retrieved successfully',
      timestamp: new Date().toISOString(),
    };
  }

  // Course Completion Certificate Endpoints
  @Post('completion')
  @UseGuards(RolesGuard)
  @Roles('admin', 'tutor')
  @ApiOperation({ summary: 'Create course completion certificate (admin/tutor only)' })
  @ApiResponse({ status: 201, description: 'Completion certificate created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid certificate data' })
  async createCourseCompletionCertificate(
    @CurrentUser() user: JwtPayload,
    @Body() body: {
      student_id: string;
      course_id: string;
      completion_percentage: number;
      total_study_hours: number;
      completion_date: string;
      final_grade?: string;
      skills_acquired?: string[];
      learning_outcomes?: string[];
      instructor_notes?: string;
    },
  ) {
    const certificate = await this.certificateGenerationService.getCourseCompletionCertificate(
      body.student_id,
      body.course_id,
    );

    return {
      success: true,
      data: certificate,
      message: 'Course completion certificate created successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('completion')
  @UseGuards(RolesGuard)
  @Roles('student', 'tutor', 'admin')
  @ApiOperation({ summary: 'Get course completion certificates' })
  @ApiResponse({ status: 200, description: 'Completion certificates retrieved successfully' })
  @ApiQuery({ name: 'studentId', required: false, type: String, description: 'Filter by student ID' })
  @ApiQuery({ name: 'courseId', required: false, type: String, description: 'Filter by course ID' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page' })
  async getCourseCompletionCertificates(
    @CurrentUser() user: JwtPayload,
    @Query('studentId') studentId?: string,
    @Query('courseId') courseId?: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    const certificates = await this.certificateGenerationService.getCourseCompletionCertificates(
      user.sub,
      studentId,
      courseId,
      page,
      limit,
    );

    return {
      success: true,
      data: certificates,
      message: 'Course completion certificates retrieved successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('completion/:id')
  @UseGuards(RolesGuard)
  @Roles('student', 'tutor', 'admin')
  @ApiOperation({ summary: 'Get course completion certificate by ID' })
  @ApiResponse({ status: 200, description: 'Completion certificate retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Certificate not found' })
  async getCourseCompletionCertificate(
    @CurrentUser() user: JwtPayload,
    @Param('id') certificateId: string,
  ) {
    const certificate = await this.certificateGenerationService.getCourseCompletionCertificate(
      certificateId,
      user.sub,
    );

    return {
      success: true,
      data: certificate,
      message: 'Course completion certificate retrieved successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Put('completion/:id/verify')
  @UseGuards(RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Verify course completion certificate (admin only)' })
  @ApiResponse({ status: 200, description: 'Certificate verified successfully' })
  @ApiResponse({ status: 404, description: 'Certificate not found' })
  async verifyCourseCompletionCertificate(
    @CurrentUser() user: JwtPayload,
    @Param('id') certificateId: string,
  ) {
    const certificate = await this.certificateGenerationService.verifyCourseCompletionCertificate(
      certificateId,
      user.sub,
    );

    return {
      success: true,
      data: certificate,
      message: 'Course completion certificate verified successfully',
      timestamp: new Date().toISOString(),
    };
  }
}
