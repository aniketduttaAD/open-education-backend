import { IsEnum, IsNotEmpty } from 'class-validator';

export class RoleSelectionDto {
  @IsEnum(['student', 'tutor', 'admin'])
  @IsNotEmpty()
  role!: 'student' | 'tutor' | 'admin';
}
