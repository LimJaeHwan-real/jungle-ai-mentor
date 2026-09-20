import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AdminDocumentsController } from '../ai/admin-documents.controller';
import { AdminRagController } from '../ai/admin-rag.controller';
import { AdminEmailGuard } from './admin-email.guard';
import { isAdminEmail } from './admin-access';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('관리자 이메일 허용 목록', () => {
  const contextFor = (email?: string) => ({
    switchToHttp: () => ({ getRequest: () => ({ user: email ? { email } : undefined }) }),
  }) as ExecutionContext;

  it('설정이 없거나 빈 경우와 허용되지 않은 계정을 차단한다', () => {
    expect(isAdminEmail('person@example.com', undefined)).toBe(false);
    expect(isAdminEmail('person@example.com', '')).toBe(false);
    expect(isAdminEmail('person@example.com', 'other@example.com')).toBe(false);
    const guard = new AdminEmailGuard({ get: () => '' } as never);
    expect(() => guard.canActivate(contextFor('person@example.com'))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(contextFor())).toThrow(ForbiddenException);
  });

  it('서버에서 읽은 사용자 이메일이 허용 목록에 있으면 대소문자와 공백을 정규화해 허용한다', () => {
    const guard = new AdminEmailGuard({ get: () => 'other@example.com, ADMIN@EXAMPLE.COM ' } as never);
    expect(guard.canActivate(contextFor('admin@example.com'))).toBe(true);
    expect(guard.canActivate(contextFor('other@example.com'))).toBe(true);
    expect(() => guard.canActivate(contextFor('person@example.com'))).toThrow(ForbiddenException);
  });

  it('로그인 사용자 정보에는 같은 서버 기준으로 운영자 여부를 표시한다', () => {
    const auth = new AuthService({} as never, {} as never, { get: () => 'admin@example.com' } as never);
    expect(auth.me({ email: 'admin@example.com' } as never)).toMatchObject({ isAdmin: true });
    expect(auth.me({ email: 'person@example.com' } as never)).toMatchObject({ isAdmin: false });
  });

  it('문서 등록·RAG 운영 경로에서 인증 뒤 운영자 검사를 적용한다', () => {
    for (const controller of [AdminDocumentsController, AdminRagController]) {
      expect(Reflect.getMetadata(GUARDS_METADATA, controller)).toEqual([JwtAuthGuard, AdminEmailGuard]);
    }
  });
});
