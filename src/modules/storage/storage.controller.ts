import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  HttpCode,
  HttpStatus,
  Res,
  Headers,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiConsumes, ApiQuery } from '@nestjs/swagger';
import { StorageService } from './services/storage.service';
import { UploadFileDto, GenerateSignedUrlDto } from './dto';
import { JwtAuthGuard } from '../../common/guards';
import { CurrentUser } from '../../common/decorators';
import { JwtPayload } from '../../config/jwt.config';
import { Response } from 'express';
import { MinioService } from './services/minio.service';
import { MINIO_BUCKETS } from '../../config/minio.config';
import { CoursesService } from '../courses/services/courses.service';

/**
 * Storage controller for file upload, download, and management operations
 */
@ApiTags('Storage')
@Controller('files')
@UseGuards(JwtAuthGuard)
export class StorageController {
  private readonly logger = new Logger(StorageController.name);

  constructor(
    private readonly storageService: StorageService,
    private readonly minioService: MinioService,
    private readonly coursesService: CoursesService,
  ) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload file' })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 201, description: 'File uploaded successfully' })
  @ApiResponse({ status: 400, description: 'Invalid file or upload data' })
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  async uploadFile(
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file: any,
    @Body() uploadData: UploadFileDto,
  ) {
    if (!file) {
      throw new Error('No file provided');
    }

    return this.storageService.uploadFile(user.sub, file, uploadData);
  }

  @Post('signed-url')
  @ApiOperation({ summary: 'Generate presigned URL for direct upload' })
  @ApiResponse({ status: 201, description: 'Signed URL generated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request data' })
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  async generateSignedUrl(
    @CurrentUser() user: JwtPayload,
    @Body() signedUrlData: GenerateSignedUrlDto,
  ) {
    return this.storageService.generateSignedUrl(user.sub, signedUrlData);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get file details' })
  @ApiResponse({ status: 200, description: 'File details retrieved successfully' })
  @ApiResponse({ status: 404, description: 'File not found' })
  @ApiBearerAuth()
  async getFile(
    @CurrentUser() user: JwtPayload,
    @Param('id') fileId: string,
  ) {
    return this.storageService.getFile(fileId, user.sub);
  }

  @Get(':id/download')
  @ApiOperation({ summary: 'Get file download URL' })
  @ApiResponse({ status: 200, description: 'Download URL generated successfully' })
  @ApiResponse({ status: 404, description: 'File not found' })
  @ApiBearerAuth()
  async getFileDownloadUrl(
    @CurrentUser() user: JwtPayload,
    @Param('id') fileId: string,
  ) {
    const downloadUrl = await this.storageService.getFileDownloadUrl(fileId, user.sub);
    return { downloadUrl };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete file' })
  @ApiResponse({ status: 200, description: 'File deleted successfully' })
  @ApiResponse({ status: 404, description: 'File not found' })
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteFile(
    @CurrentUser() user: JwtPayload,
    @Param('id') fileId: string,
  ) {
    await this.storageService.deleteFile(fileId, user.sub);
  }

  @Get()
  @ApiOperation({ summary: 'List user files' })
  @ApiResponse({ status: 200, description: 'Files retrieved successfully' })
  @ApiQuery({ name: 'fileType', required: false, description: 'Filter by file type' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page' })
  @ApiBearerAuth()
  async listUserFiles(
    @CurrentUser() user: JwtPayload,
    @Query('fileType') fileType?: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ) {
    return this.storageService.listUserFiles(user.sub, fileType, page, limit);
  }

  @Get('stats/overview')
  @ApiOperation({ summary: 'Get storage statistics' })
  @ApiResponse({ status: 200, description: 'Storage statistics retrieved successfully' })
  @ApiBearerAuth()
  async getStorageStats(@CurrentUser() user: JwtPayload) {
    return this.storageService.getStorageStats(user.sub);
  }

  @Get('stream')
  @ApiOperation({ summary: 'Stream course video (Range-supported, authZ enforced)' })
  @ApiBearerAuth()
  async streamCourseVideo(
    @CurrentUser() user: JwtPayload,
    @Query('courseId') courseId: string,
    @Query('section') section: string,
    @Query('subtopic') subtopic: string,
    @Headers('range') range: string | undefined,
    @Res() res: Response,
  ) {
    // AuthZ: allow tutor (course owner) or enrolled student
    const course = await this.coursesService.getCourseById(courseId);
    const isTutor = (course as any).tutor_user_id === user.sub;
    let isEnrolled = false;
    if (!isTutor) {
      try {
        const enrollments = await this.coursesService.getStudentEnrollments(user.sub);
        isEnrolled = enrollments.some((e: any) => e.course_id === courseId);
      } catch {}
    }
    if (!isTutor && !isEnrolled) {
      return res.status(HttpStatus.FORBIDDEN).send('Access denied');
    }

    // Resolve object key
    const objectKey = `${section}/${subtopic}.mp4`;
    const bucket = MINIO_BUCKETS.COURSES;

    // Get metadata for size
    const stat = await this.minioService.getFileMetadata(bucket, objectKey);
    const totalSize = parseInt((stat as any).size, 10) || (stat as any).size;

    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'private, max-age=0');
    res.setHeader('Content-Disposition', 'inline');

    if (range) {
      const matches = /bytes=(\d+)-(\d*)/.exec(range);
      if (matches) {
        const start = parseInt(matches[1], 10);
        const end = matches[2] ? parseInt(matches[2], 10) : totalSize - 1;
        const chunkSize = end - start + 1;

        res.status(HttpStatus.PARTIAL_CONTENT);
        res.setHeader('Content-Range', `bytes ${start}-${end}/${totalSize}`);
        res.setHeader('Content-Length', String(chunkSize));

        const stream = await this.minioService.getObjectStream(bucket, objectKey, start, end);
        return stream.pipe(res);
      }
    }

    res.setHeader('Content-Length', String(totalSize));
    const stream = await this.minioService.getObjectStream(bucket, objectKey);
    return stream.pipe(res);
  }

  @Get('presign')
  @ApiOperation({ summary: 'Generate presigned URL for course media with authZ checks' })
  @ApiResponse({ status: 200, description: 'Presigned URL generated successfully' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  @ApiResponse({ status: 404, description: 'Course or media not found' })
  @ApiBearerAuth()
  async generatePresignedUrl(
    @CurrentUser() user: JwtPayload,
    @Query('courseId') courseId: string,
    @Query('sectionId') sectionId?: string,
    @Query('subtopicId') subtopicId?: string,
    @Query('mediaType') mediaType: 'video' | 'audio' | 'slides' | 'document' = 'video',
    @Query('expiresIn') expiresIn: number = 120, // 2 minutes default
  ) {
    // Validate inputs
    if (!courseId) {
      throw new BadRequestException('courseId is required');
    }

    // AuthZ: allow tutor (course owner) or enrolled student
    const course = await this.coursesService.getCourseById(courseId);
    if (!course) {
      throw new NotFoundException('Course not found');
    }

    const isTutor = (course as any).tutor_user_id === user.sub;
    let isEnrolled = false;
    
    if (!isTutor) {
      try {
        const enrollments = await this.coursesService.getStudentEnrollments(user.sub);
        isEnrolled = enrollments.some((e: any) => e.course_id === courseId);
      } catch (error) {
        this.logger.warn(`Failed to check enrollment for user ${user.sub} in course ${courseId}:`, error);
      }
    }

    if (!isTutor && !isEnrolled) {
      throw new ForbiddenException('Access denied. You must be the course tutor or an enrolled student.');
    }

    // Construct object key based on media type and provided parameters
    let objectKey: string;
    let bucket: string;

    switch (mediaType) {
      case 'video':
        if (!sectionId || !subtopicId) {
          throw new BadRequestException('sectionId and subtopicId are required for video access');
        }
        objectKey = `${sectionId}/${subtopicId}.mp4`;
        bucket = MINIO_BUCKETS.COURSES;
        break;
      
      case 'audio':
        if (!sectionId || !subtopicId) {
          throw new BadRequestException('sectionId and subtopicId are required for audio access');
        }
        objectKey = `${sectionId}/${subtopicId}.mp3`;
        bucket = MINIO_BUCKETS.AUDIO;
        break;
      
      case 'slides':
        if (!sectionId || !subtopicId) {
          throw new BadRequestException('sectionId and subtopicId are required for slides access');
        }
        objectKey = `${sectionId}/${subtopicId}/`;
        bucket = MINIO_BUCKETS.SLIDES;
        break;
      
      case 'document':
        if (!sectionId) {
          throw new BadRequestException('sectionId is required for document access');
        }
        objectKey = `${sectionId}/${subtopicId || 'content'}.md`;
        bucket = MINIO_BUCKETS.DOCUMENTS;
        break;
      
      default:
        throw new BadRequestException('Invalid mediaType. Must be one of: video, audio, slides, document');
    }

    // Validate expiration time (max 1 hour for security)
    const maxExpiresIn = 3600; // 1 hour
    const actualExpiresIn = Math.min(expiresIn, maxExpiresIn);

    try {
      // Generate presigned URL
      const presignedUrl = await this.minioService.generatePresignedDownloadUrl(
        bucket,
        objectKey,
        actualExpiresIn,
      );

      this.logger.log(`Generated presigned URL for user ${user.sub} to access ${mediaType} in course ${courseId}`);

      return {
        presignedUrl,
        expiresIn: actualExpiresIn,
        mediaType,
        courseId,
        sectionId,
        subtopicId,
        expiresAt: new Date(Date.now() + actualExpiresIn * 1000).toISOString(),
      };
    } catch (error) {
      this.logger.error(`Failed to generate presigned URL for course ${courseId}:`, error);
      throw new BadRequestException('Failed to generate presigned URL');
    }
  }
}
