import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { JwtPayload } from '../../../config/jwt.config';
import { AuthService } from '../auth.service';
import { getOwnerAdminConfig, OWNER_JWT_PAYLOAD } from '../../../config/owner-admin.config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private authService: AuthService,
  ) {
    const secret = configService.get<string>('JWT_SECRET');
    if (!secret) {
      Logger.warn('JWT_SECRET is not set. JWT verification will fail.', JwtStrategy.name);
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: JwtPayload) {
    if (!payload?.sub) {
      Logger.warn('JWT payload missing sub', JwtStrategy.name);
      throw new UnauthorizedException('Invalid token');
    }

    // Check if this is the owner admin token
    const ownerConfig = getOwnerAdminConfig(this.configService);
    if (payload.sub === ownerConfig.ownerId && payload.email === ownerConfig.ownerEmail) {
      Logger.log('Owner admin access granted', JwtStrategy.name);
      return {
        sub: payload.sub,
        email: payload.email,
        user_type: 'admin' as const,
        isOwner: true,
        permissions: ['*'],
      };
    }

    const user = await this.authService.validateUser(payload.sub);
    
    if (!user) {
      Logger.warn(`User not found for sub=${payload.sub}`, JwtStrategy.name);
      throw new UnauthorizedException('Invalid token');
    }

    return {
      sub: user.id,
      email: user.email,
      user_type: user.user_type,
      isOwner: false,
    };
  }
}
