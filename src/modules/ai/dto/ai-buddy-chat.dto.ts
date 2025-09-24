import { IsString, IsOptional, IsArray, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AIBuddyChatDto {
  @ApiProperty({ description: 'User message to AI Buddy' })
  @IsString()
  message!: string;

  @ApiPropertyOptional({ description: 'Conversation history' })
  @IsOptional()
  @IsArray()
  conversation_history?: Array<{
    role: string;
    content: string;
  }>;
}
