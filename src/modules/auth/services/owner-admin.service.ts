import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { getOwnerAdminConfig, OWNER_JWT_PAYLOAD } from '../../../config/owner-admin.config';

@Injectable()
export class OwnerAdminService {
  private readonly logger = new Logger(OwnerAdminService.name);

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  /**
   * Generate owner admin JWT token
   */
  async generateOwnerToken(): Promise<string> {
    const ownerConfig = getOwnerAdminConfig(this.configService);
    
    this.logger.log('Generating owner admin JWT token');
    
    const payload = {
      ...OWNER_JWT_PAYLOAD,
      sub: ownerConfig.ownerId,
      email: ownerConfig.ownerEmail,
    };

    const token = await this.jwtService.signAsync(payload, {
      secret: this.configService.get<string>('JWT_SECRET'),
      expiresIn: '365d', // 1 year expiration for owner token
    });

    this.logger.log(`Owner admin token generated for: ${ownerConfig.ownerEmail}`);
    return token;
  }

  /**
   * Get owner admin information
   */
  getOwnerInfo() {
    const ownerConfig = getOwnerAdminConfig(this.configService);
    return {
      id: ownerConfig.ownerId,
      email: ownerConfig.ownerEmail,
      name: ownerConfig.ownerName,
      isOwner: true,
      permissions: ['*'],
    };
  }

  /**
   * Validate if a token is the owner token
   */
  isOwnerToken(token: string): boolean {
    const ownerConfig = getOwnerAdminConfig(this.configService);
    return token === ownerConfig.ownerJwtToken;
  }
}
