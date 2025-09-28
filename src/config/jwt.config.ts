import { JwtModuleOptions } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

export const getJwtConfig = (configService: ConfigService): JwtModuleOptions => {
  const secret = configService.get<string>('JWT_SECRET');
  if (!secret) {
    throw new Error('JWT_SECRET is not set');
  }
  return {
    secret,
    signOptions: {
      expiresIn: '7d',
    },
  };
};

export const getJwtRefreshConfig = (configService: ConfigService): JwtModuleOptions => {
  const secret = configService.get<string>('JWT_REFRESH_SECRET');
  if (!secret) {
    throw new Error('JWT_REFRESH_SECRET is not set');
  }
  return {
    secret,
    signOptions: {
      expiresIn: '30d',
    },
  };
};

export interface JwtPayload {
  sub: string; // user ID
  email: string;
  user_type: 'student' | 'tutor' | 'admin';
  isOwner?: boolean;
  permissions?: string[];
  iat?: number;
  exp?: number;
}

export interface JwtRefreshPayload {
  sub: string; // user ID
  tokenVersion: number;
  iat?: number;
  exp?: number;
}

export default getJwtConfig;
