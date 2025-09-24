import { SetMetadata } from '@nestjs/common';

export type UserType = 'student' | 'tutor' | 'admin';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserType[]) => SetMetadata(ROLES_KEY, roles);
