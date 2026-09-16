import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { User } from '../users/user.entity';
import { isAdminEmail } from './admin-access';

@Injectable()
export class AdminEmailGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ user?: User }>();
    if (!isAdminEmail(request.user?.email, this.config.get<string>('ADMIN_EMAIL_ALLOWLIST'))) {
      throw new ForbiddenException('운영자 권한이 필요합니다.');
    }
    return true;
  }
}
