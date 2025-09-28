import { IsString, IsUUID } from 'class-validator';

export class AIBuddyQueryDto {
  @IsUUID()
  courseId!: string;

  @IsString()
  message!: string;
}
