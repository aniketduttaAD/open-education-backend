import { IsNumber, IsString, Min, Max, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class WithdrawalRequestDto {
  @ApiProperty({ 
    description: 'Withdrawal amount in paise',
    minimum: 1000,
    maximum: 10000000
  })
  @IsNumber()
  @Min(1000) // Minimum ₹10.00
  @Max(10000000) // Maximum ₹100,000.00
  amount!: number;

  @ApiProperty({ 
    description: 'Bank account number' 
  })
  @IsString()
  accountNumber!: string;

  @ApiProperty({ 
    description: 'IFSC code' 
  })
  @IsString()
  ifscCode!: string;

  @ApiProperty({ 
    description: 'Account holder name' 
  })
  @IsString()
  accountHolderName!: string;

  @ApiPropertyOptional({ 
    description: 'Bank name' 
  })
  @IsOptional()
  @IsString()
  bankName?: string;

  @ApiPropertyOptional({ 
    description: 'Additional notes' 
  })
  @IsOptional()
  @IsString()
  notes?: string;
}
