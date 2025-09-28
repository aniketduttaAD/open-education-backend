import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Req,
  Res,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { OwnerAdminService } from './services/owner-admin.service';
import { GoogleLoginDto, RefreshTokenDto } from './dto';
import { JwtAuthGuard } from '../../common/guards';
import { CurrentUser, Public } from '../../common/decorators';
import { JwtPayload } from '../../config/jwt.config';
import { ConfigService } from '@nestjs/config';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly ownerAdminService: OwnerAdminService,
    private readonly configService: ConfigService,
  ) {}

  @Public()
  @Get('google')
  @ApiOperation({ summary: 'Deprecated: use One Tap /auth/google/login' })
  @ApiResponse({ status: 302, description: 'Redirect to frontend login' })
  async googleAuth(@Req() req: Request, @Res() res: Response) {
    const frontendUrl = this.configService.get<string>('FRONTEND_URL', 'http://localhost:3000');
    return res.redirect(`${frontendUrl}/login?method=one-tap`);
  }

  @Public()
  @Get('google/callback')
  @ApiOperation({ summary: 'Deprecated: use One Tap /auth/google/login' })
  @ApiResponse({ status: 302, description: 'Redirect to frontend login' })
  async googleAuthRedirect(@Req() req: Request, @Res() res: Response) {
    const frontendUrl = this.configService.get<string>('FRONTEND_URL', 'http://localhost:3000');
    return res.redirect(`${frontendUrl}/login?method=one-tap`);
  }

  @Public()
  @Post('google/login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Google OAuth login' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async googleLogin(@Body() googleLoginDto: GoogleLoginDto) {
    return this.authService.googleLogin(googleLoginDto);
  }

  // Removed traditional signup. Google-only auth flow is supported.

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh JWT token' })
  @ApiResponse({ status: 200, description: 'Token refreshed successfully' })
  @ApiResponse({ status: 401, description: 'Invalid refresh token' })
  async refreshToken(@Body() refreshTokenDto: RefreshTokenDto) {
    return this.authService.refreshToken(refreshTokenDto.refresh_token);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout user' })
  @ApiResponse({ status: 200, description: 'Logged out successfully' })
  @ApiBearerAuth()
  async logout(@CurrentUser() user: JwtPayload) {
    return this.authService.logout(user.sub);
  }

  @Public()
  @Get('owner/token')
  @ApiOperation({ summary: 'Get owner admin JWT token (development only)' })
  @ApiResponse({ status: 200, description: 'Owner token generated successfully' })
  async getOwnerToken() {
    const token = await this.ownerAdminService.generateOwnerToken();
    const ownerInfo = this.ownerAdminService.getOwnerInfo();
    
    return {
      success: true,
      data: {
        token,
        owner: ownerInfo,
        expires_in: '365d',
        permissions: ['*'],
      },
      message: 'Owner admin token generated successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Public()
  @Get('owner/info')
  @ApiOperation({ summary: 'Get owner admin information' })
  @ApiResponse({ status: 200, description: 'Owner info retrieved successfully' })
  async getOwnerInfo() {
    const ownerInfo = this.ownerAdminService.getOwnerInfo();
    
    return {
      success: true,
      data: ownerInfo,
      message: 'Owner admin information retrieved successfully',
      timestamp: new Date().toISOString(),
    };
  }

  // Profile routes live under `users` module.
}
