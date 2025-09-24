import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY, UserType } from '../decorators/roles.decorator';
import { JwtPayload } from '../../config/jwt.config';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserType[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    
    if (!requiredRoles) {
      return true;
    }
    
    const { user }: { user: JwtPayload } = context.switchToHttp().getRequest();
    
    if (!user) {
      return false;
    }
    
    return requiredRoles.some((role) => user.user_type === role);
  }
}
