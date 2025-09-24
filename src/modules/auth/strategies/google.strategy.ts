import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(private configService: ConfigService) {
    super({
      clientID: configService.get<string>('GOOGLE_CLIENT_ID', 'your-google-client-id'),
      clientSecret: configService.get<string>('GOOGLE_CLIENT_SECRET', 'your-google-client-secret'),
      // For dev: ensure this points to the backend callback endpoint
      callbackURL: configService.get<string>('GOOGLE_CALLBACK_URL', 'http://localhost:8081/auth/google/callback'),
      scope: ['email', 'profile'],
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: any,
    done: VerifyCallback,
  ): Promise<any> {
    const { id, name, emails, photos } = profile;

    // Provide normalized profile to the request. Persistence is handled in service.
    const normalizedProfile = {
      google_id: id,
      email: emails?.[0]?.value,
      name: `${name?.givenName ?? ''} ${name?.familyName ?? ''}`.trim(),
      image: photos?.[0]?.value,
      oauth_access_token: accessToken,
    };

    done(null, normalizedProfile);
  }
}
