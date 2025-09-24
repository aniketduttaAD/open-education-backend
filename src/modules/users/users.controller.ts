import {
  Controller,
  Get,
  Put,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery, ApiConsumes } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { UsersService } from './services/users.service';
import { TutorDocumentsService } from './services/tutor-documents.service';
import {
  UpdateTutorDetailsDto,
  UpdateStudentDetailsDto,
  UpdateOnboardingDto,
} from '../auth/dto';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { Roles, CurrentUser, Public } from '../../common/decorators';
import { JwtPayload } from '../../config/jwt.config';

/**
 * Users controller for managing user profiles, achievements, and tutor-specific features
 */
@ApiTags('Users')
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly tutorDocumentsService: TutorDocumentsService,
  ) {}

  @Get('profile')
  @ApiOperation({ summary: 'Get current user profile with details' })
  @ApiResponse({ status: 200, description: 'Profile retrieved successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiBearerAuth()
  async getProfile(@CurrentUser() user: JwtPayload) {
    return this.usersService.getUserById(user.sub);
  }

  @Put('profile')
  @ApiOperation({ summary: 'Update user profile' })
  @ApiResponse({ status: 200, description: 'Profile updated successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiBearerAuth()
  async updateProfile(
    @CurrentUser() user: JwtPayload,
    @Body() updateData: any, // Will be updated when we create the proper DTO
  ) {
    return this.usersService.updateUser(user.sub, updateData);
  }

  @Put('tutor-details')
  @ApiOperation({ summary: 'Update tutor-specific details' })
  @ApiResponse({ status: 200, description: 'Tutor details updated successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiBearerAuth()
  @Roles('tutor')
  async updateTutorDetails(
    @CurrentUser() user: JwtPayload,
    @Body() tutorDetails: UpdateTutorDetailsDto,
  ) {
    return this.usersService.updateTutorDetails(user.sub, tutorDetails);
  }

  @Put('student-details')
  @ApiOperation({ summary: 'Update student-specific details' })
  @ApiResponse({ status: 200, description: 'Student details updated successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiBearerAuth()
  @Roles('student')
  async updateStudentDetails(
    @CurrentUser() user: JwtPayload,
    @Body() studentDetails: UpdateStudentDetailsDto,
  ) {
    return this.usersService.updateStudentDetails(user.sub, studentDetails);
  }

  @Put('onboarding')
  @ApiOperation({ summary: 'Update onboarding status' })
  @ApiResponse({ status: 200, description: 'Onboarding status updated successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiBearerAuth()
  async updateOnboarding(
    @CurrentUser() user: JwtPayload,
    @Body() onboardingData: UpdateOnboardingDto,
  ) {
    return this.usersService.updateOnboardingStatus(user.sub, onboardingData.onboarding_complete);
  }

  @Get('tutors')
  @Public()
  @ApiOperation({ summary: 'Get list of tutors' })
  @ApiResponse({ status: 200, description: 'Tutors retrieved successfully' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page' })
  async getTutors(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    return this.usersService.getTutors(page, limit);
  }

  @Get('students')
  @Public()
  @ApiOperation({ summary: 'Get list of students' })
  @ApiResponse({ status: 200, description: 'Students retrieved successfully' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page' })
  async getStudents(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    return this.usersService.getStudents(page, limit);
  }

  @Get('me/achievements')
  @ApiOperation({ summary: 'Get student achievements' })
  @ApiResponse({ status: 200, description: 'Achievements retrieved successfully' })
  @ApiBearerAuth()
  @Roles('student')
  async getStudentAchievements(@CurrentUser() user: JwtPayload) {
    return this.usersService.getStudentAchievements(user.sub);
  }

  @Get('me/login-streak')
  @ApiOperation({ summary: 'Get student login streak' })
  @ApiResponse({ status: 200, description: 'Login streak retrieved successfully' })
  @ApiBearerAuth()
  @Roles('student')
  async getStudentLoginStreak(@CurrentUser() user: JwtPayload) {
    return this.usersService.getStudentLoginStreak(user.sub);
  }

  @Get('me/token-allocations')
  @ApiOperation({ summary: 'Get student token allocations' })
  @ApiResponse({ status: 200, description: 'Token allocations retrieved successfully' })
  @ApiBearerAuth()
  @Roles('student')
  async getStudentTokenAllocations(@CurrentUser() user: JwtPayload) {
    return this.usersService.getStudentTokenAllocations(user.sub);
  }

  @Get('me/wishlist')
  @ApiOperation({ summary: 'Get student wishlist' })
  @ApiResponse({ status: 200, description: 'Wishlist retrieved successfully' })
  @ApiBearerAuth()
  @Roles('student')
  async getStudentWishlist(@CurrentUser() user: JwtPayload) {
    return this.usersService.getStudentWishlist(user.sub);
  }

  @Post('me/wishlist/courses/:courseId')
  @ApiOperation({ summary: 'Add course to wishlist' })
  @ApiResponse({ status: 201, description: 'Course added to wishlist successfully' })
  @ApiBearerAuth()
  @Roles('student')
  @HttpCode(HttpStatus.CREATED)
  async addToWishlist(
    @CurrentUser() user: JwtPayload,
    @Param('courseId') courseId: string,
  ) {
    return this.usersService.addToWishlist(user.sub, courseId);
  }

  @Delete('me/wishlist/courses/:courseId')
  @ApiOperation({ summary: 'Remove course from wishlist' })
  @ApiResponse({ status: 200, description: 'Course removed from wishlist successfully' })
  @ApiBearerAuth()
  @Roles('student')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeFromWishlist(
    @CurrentUser() user: JwtPayload,
    @Param('courseId') courseId: string,
  ) {
    await this.usersService.removeFromWishlist(user.sub, courseId);
  }

  @Get('me/earnings')
  @ApiOperation({ summary: 'Get tutor earnings' })
  @ApiResponse({ status: 200, description: 'Earnings retrieved successfully' })
  @ApiBearerAuth()
  @Roles('tutor')
  async getTutorEarnings(@CurrentUser() user: JwtPayload) {
    return this.usersService.getTutorEarnings(user.sub);
  }

  // @Post('me/withdrawals')
  // @ApiOperation({ summary: 'Request withdrawal' })
  // @ApiResponse({ status: 201, description: 'Withdrawal request created successfully' })
  // @ApiBearerAuth()
  // @Roles('tutor')
  // @HttpCode(HttpStatus.CREATED)
  // async requestWithdrawal(
  //   @CurrentUser() user: JwtPayload,
  //   @Body() withdrawalData: any,
  // ) {
  //   return this.usersService.requestWithdrawal(user.sub, withdrawalData);
  // }

  // @Get('me/withdrawals')
  // @ApiOperation({ summary: 'Get withdrawal history' })
  // @ApiResponse({ status: 200, description: 'Withdrawal history retrieved successfully' })
  // @ApiBearerAuth()
  // @Roles('tutor')
  // async getWithdrawalHistory(@CurrentUser() user: JwtPayload) {
  //   return this.usersService.getWithdrawalHistory(user.sub);
  // }

  @Get('leaderboard')
  @Public()
  @ApiOperation({ summary: 'Get tutor leaderboard' })
  @ApiResponse({ status: 200, description: 'Leaderboard retrieved successfully' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Number of top tutors to return' })
  async getTutorLeaderboard(@Query('limit') limit: number = 10) {
    return this.usersService.getTutorLeaderboard(limit);
  }

  @Post('tutors/documents/upload')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload tutor verification document' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 201, description: 'Document uploaded successfully' })
  @ApiResponse({ status: 400, description: 'Invalid file or upload data' })
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  async uploadVerificationDocument(
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file: any,
    @Body() uploadData: { file_type: string; description?: string },
  ) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    const document = await this.tutorDocumentsService.uploadVerificationDocument(
      user.sub,
      file,
      {
        file_type: uploadData.file_type as 'degree' | 'certificate' | 'id_proof' | 'address_proof' | 'other',
        description: uploadData.description,
      },
    );

    return {
      success: true,
      data: document,
      message: 'Verification document uploaded successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('tutors/documents')
  @ApiOperation({ summary: 'Get tutor verification documents' })
  @ApiResponse({ status: 200, description: 'Documents retrieved successfully' })
  async getTutorDocuments(@CurrentUser() user: JwtPayload) {
    const documents = await this.tutorDocumentsService.getTutorDocuments(user.sub);
    return {
      success: true,
      data: documents,
      message: 'Verification documents retrieved successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Delete('tutors/documents/:documentId')
  @ApiOperation({ summary: 'Delete tutor verification document' })
  @ApiResponse({ status: 200, description: 'Document deleted successfully' })
  @ApiResponse({ status: 404, description: 'Document not found' })
  async deleteVerificationDocument(
    @CurrentUser() user: JwtPayload,
    @Param('documentId') documentId: string,
  ) {
    await this.tutorDocumentsService.deleteVerificationDocument(user.sub, documentId);
    return {
      success: true,
      message: 'Verification document deleted successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Put('tutors/documents/:documentId')
  @ApiOperation({ summary: 'Update tutor verification document metadata' })
  @ApiResponse({ status: 200, description: 'Document updated successfully' })
  @ApiResponse({ status: 404, description: 'Document not found' })
  async updateVerificationDocument(
    @CurrentUser() user: JwtPayload,
    @Param('documentId') documentId: string,
    @Body() update: { description?: string; document_type?: 'degree' | 'certificate' | 'id_proof' | 'address_proof' | 'other' },
  ) {
    const updated = await this.tutorDocumentsService.updateVerificationDocument(user.sub, documentId, update);
    return {
      success: true,
      data: updated,
      message: 'Verification document updated successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('tutors/documents/:documentId/url')
  @ApiOperation({ summary: 'Get download URL for a verification document' })
  @ApiResponse({ status: 200, description: 'URL generated successfully' })
  @ApiResponse({ status: 404, description: 'Document not found' })
  async getVerificationDocumentUrl(
    @CurrentUser() user: JwtPayload,
    @Param('documentId') documentId: string,
  ) {
    const url = await this.tutorDocumentsService.getVerificationDocumentUrl(user.sub, documentId);
    return {
      success: true,
      data: { url },
      message: 'Verification document URL generated successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('tutors/verification-status')
  @ApiOperation({ summary: 'Check tutor verification requirements' })
  @ApiResponse({ status: 200, description: 'Verification status retrieved successfully' })
  async getVerificationStatus(@CurrentUser() user: JwtPayload) {
    const status = await this.tutorDocumentsService.checkVerificationRequirements(user.sub);
    return {
      success: true,
      data: status,
      message: 'Verification status retrieved successfully',
      timestamp: new Date().toISOString(),
    };
  }
}
