import { IsString, IsNumber, Min, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class WithdrawalRequestDto {
  @ApiProperty({ description: 'Withdrawal amount in INR', minimum: 100 })
  @IsNumber()
  @Min(100)
  amount!: number;

  @ApiProperty({ description: 'Bank account number' })
  @IsString()
  bank_account_number!: string;

  @ApiProperty({ description: 'IFSC code' })
  @IsString()
  ifsc_code!: string;

  @ApiProperty({ description: 'Bank name' })
  @IsString()
  bank_name!: string;

  @ApiProperty({ description: 'Account holder name' })
  @IsString()
  account_holder_name!: string;
}
