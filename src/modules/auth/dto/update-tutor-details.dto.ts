import { IsOptional, IsBoolean, IsObject, IsArray, IsString, IsNumber, IsEnum } from 'class-validator';

export class UpdateTutorDetailsDto {
  @IsOptional()
  @IsBoolean()
  register_fees_paid?: boolean;

  @IsOptional()
  @IsObject()
  qualifications?: {
    education: string;
    certifications: string[];
    experience_years: number;
  };

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  expertise_areas?: string[];

  @IsOptional()
  @IsEnum(['pending', 'verified', 'rejected'])
  verification_status?: 'pending' | 'verified' | 'rejected';

  @IsOptional()
  @IsObject()
  bank_details?: {
    account_holder_name: string;
    account_number: string;
    ifsc_code: string;
    bank_name: string;
    account_type: 'savings' | 'current';
    verified: boolean;
  };
}
