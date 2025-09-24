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
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiConsumes, ApiQuery } from '@nestjs/swagger';
import { StorageService } from './services/storage.service';
import { UploadFileDto, GenerateSignedUrlDto } from './dto';
import { JwtAuthGuard } from '../../common/guards';
import { CurrentUser } from '../../common/decorators';
import { JwtPayload } from '../../config/jwt.config';

/**
 * Storage controller for file upload, download, and management operations
 */
@ApiTags('Storage')
@Controller('files')
@UseGuards(JwtAuthGuard)
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

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
}
