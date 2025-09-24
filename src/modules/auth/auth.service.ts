import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { User } from './entities';
import { GoogleLoginDto, CreateUserDto, UpdateUserDto } from './dto';
import { JwtPayload, JwtRefreshPayload } from '../../config/jwt.config';
import { OAuth2Client } from 'google-auth-library';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async validateUser(userId: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { id: userId },
    });
  }

  async googleAuth(req: Request, res: Response) {
    // This will be handled by Passport Google Strategy
    // The strategy will redirect to Google OAuth
  }

  async googleAuthRedirect(req: Request & { user?: any }, res: Response) {
    const oauth = req.user as any;
    const frontendUrl = this.configService.get<string>('FRONTEND_URL', 'http://localhost:3000');

    if (!oauth?.email) {
      return res.redirect(`${frontendUrl}/auth/error`);
    }

    let user = await this.userRepository.findOne({ where: { email: oauth.email } });

    if (!user) {
      const defaultUserType = this.configService.get<'student' | 'tutor' | 'admin'>('DEFAULT_USER_TYPE');
      if (!defaultUserType) {
        throw new UnauthorizedException('DEFAULT_USER_TYPE is not configured');
      }
      user = this.userRepository.create({
        email: oauth.email,
        name: oauth.name || oauth.email.split('@')[0],
        image: oauth.image,
        user_type: defaultUserType,
      });
      user = await this.userRepository.save(user);
    } else {
      user.image = oauth.image || user.image;
      await this.userRepository.save(user);
    }

    const payload: JwtPayload = { sub: user.id, email: user.email, user_type: user.user_type };
    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.get<string>('JWT_SECRET'),
      expiresIn: '7d',
    });
    const refreshPayload: JwtRefreshPayload = { sub: user.id, tokenVersion: 1 };
    const refreshToken = await this.jwtService.signAsync(refreshPayload, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: '30d',
    });

    return res.redirect(
      `${frontendUrl}/auth/google/callback?access_token=${accessToken}&refresh_token=${refreshToken}`,
    );
  }

  async googleLogin(googleLoginDto: GoogleLoginDto) {
    const { token } = googleLoginDto;

    // Verify Google One Tap ID token
    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    if (!clientId) {
      throw new UnauthorizedException('Google client not configured');
    }

    const oauthClient = new OAuth2Client(clientId);
    let payload: any;
    try {
      const ticket = await oauthClient.verifyIdToken({ idToken: token, audience: clientId });
      payload = ticket.getPayload();
    } catch (err) {
      throw new UnauthorizedException('Invalid Google token');
    }

    const email = payload?.email as string | undefined;
    const name = (payload?.name as string | undefined) || `${payload?.given_name ?? ''} ${payload?.family_name ?? ''}`.trim();
    const image = (payload?.picture as string | undefined) || undefined;

    if (!email) {
      throw new UnauthorizedException('Google account has no verified email');
    }

    // Find or create user
    let user = await this.userRepository.findOne({ where: { email } });
    if (!user) {
      const defaultUserType = this.configService.get<'student' | 'tutor' | 'admin'>('DEFAULT_USER_TYPE');
      if (!defaultUserType) {
        throw new UnauthorizedException('DEFAULT_USER_TYPE is not configured');
      }
      user = this.userRepository.create({
        email,
        name: name || email.split('@')[0],
        image,
        user_type: defaultUserType,
      });
      user = await this.userRepository.save(user);
    } else {
      user.image = image || user.image;
      await this.userRepository.save(user);
    }

    // Issue tokens
    const accessTokenPayload: JwtPayload = { sub: user.id, email: user.email, user_type: user.user_type };
    const accessToken = await this.jwtService.signAsync(accessTokenPayload, {
      secret: this.configService.get<string>('JWT_SECRET'),
      expiresIn: '7d',
    });

    const refreshTokenPayload: JwtRefreshPayload = { sub: user.id, tokenVersion: 1 };
    const refreshToken = await this.jwtService.signAsync(refreshTokenPayload, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: '30d',
    });

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      user: this.sanitizeUser(user),
      message: 'Login successful',
    };
  }

  // Traditional createUser disabled in Google-only flow

  async refreshToken(refreshToken: string) {
    try {
      // Verify the refresh token
      const payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      }) as JwtRefreshPayload;

      // Find the user
      const user = await this.userRepository.findOne({
        where: { id: payload.sub },
      });

      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      // Generate new access token
      const accessTokenPayload: JwtPayload = {
        sub: user.id,
        email: user.email,
        user_type: user.user_type,
      };

      const newAccessToken = await this.jwtService.signAsync(accessTokenPayload, {
        secret: this.configService.get<string>('JWT_SECRET'),
        expiresIn: '7d', // Hardcoded for production
      });

      // Generate new refresh token
      const refreshTokenPayload: JwtRefreshPayload = {
        sub: user.id,
        tokenVersion: 1, // Simplified for new structure
      };

      const newRefreshToken = await this.jwtService.signAsync(refreshTokenPayload, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: '30d',
      });

      return {
        access_token: newAccessToken,
        refresh_token: newRefreshToken,
        user: this.sanitizeUser(user),
      };
    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async logout(userId: string) {
    // Simplified logout - no token version tracking in new structure
    return {
      message: 'Logout successful',
    };
  }

  async updateProfile(userId: string, updateUserDto: UpdateUserDto) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    Object.assign(user, updateUserDto);
    await this.userRepository.save(user);

    return this.sanitizeUser(user);
  }


  private sanitizeUser(user: User) {
    // Return user without sensitive data
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
      gender: user.gender,
      bio: user.bio,
      dob: user.dob,
      user_type: user.user_type,
      tutor_details: user.tutor_details,
      student_details: user.student_details,
      onboarding_complete: user.onboarding_complete,
      created_at: user.created_at,
      updated_at: user.updated_at,
    };
  }
}
