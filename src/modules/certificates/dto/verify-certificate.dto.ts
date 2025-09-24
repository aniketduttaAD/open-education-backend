import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyCertificateDto {
  @ApiProperty({ 
    description: 'Certificate number to verify' 
  })
  @IsString()
  certificateNumber!: string;
}
