import { IsString, IsOptional, IsDateString, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GenerateCertificateDto {
  @ApiProperty({ 
    description: 'Certificate title' 
  })
  @IsString()
  title!: string;

  @ApiPropertyOptional({ 
    description: 'Certificate description' 
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ 
    description: 'Issuer name' 
  })
  @IsOptional()
  @IsString()
  issuerName?: string;

  @ApiPropertyOptional({ 
    description: 'Issuer logo URL' 
  })
  @IsOptional()
  @IsString()
  issuerLogo?: string;

  @ApiPropertyOptional({ 
    description: 'Issue date (ISO string)' 
  })
  @IsOptional()
  @IsDateString()
  issueDate?: string;

  @ApiPropertyOptional({ 
    description: 'Expiry date (ISO string)' 
  })
  @IsOptional()
  @IsDateString()
  expiryDate?: string;

  @ApiPropertyOptional({ 
    description: 'Additional metadata' 
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}
