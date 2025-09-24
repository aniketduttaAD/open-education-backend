import { IsBoolean } from 'class-validator';

export class UpdateOnboardingDto {
  @IsBoolean()
  onboarding_complete!: boolean;
}
