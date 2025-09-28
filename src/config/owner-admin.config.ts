import { ConfigService } from '@nestjs/config';

export interface OwnerAdminConfig {
  ownerJwtToken: string;
  ownerEmail: string;
  ownerName: string;
  ownerId: string;
}

export const getOwnerAdminConfig = (configService: ConfigService): OwnerAdminConfig => {
  return {
    ownerJwtToken: configService.get<string>('OWNER_JWT_TOKEN') || 'openedu_owner_admin_2024_secure_token_never_change_this',
    ownerEmail: configService.get<string>('OWNER_EMAIL') || 'owner@openedu.com',
    ownerName: configService.get<string>('OWNER_NAME') || 'OpenEdu Owner',
    ownerId: configService.get<string>('OWNER_ID') || 'owner-admin-uuid-2024',
  };
};

// Predefined JWT payload for owner admin
export const OWNER_JWT_PAYLOAD = {
  sub: 'owner-admin-uuid-2024',
  email: 'owner@openedu.com',
  user_type: 'admin' as const,
  isOwner: true,
  permissions: ['*'], // All permissions
};
