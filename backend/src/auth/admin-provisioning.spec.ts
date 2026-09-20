import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { AdminEmailGuard } from './admin-email.guard';
import { createAdminAccount } from './admin-provisioning';

const email = 'operator@example.test';
const password = 'synthetic-test-password';
const config = { get: (key: string) => key === 'ADMIN_EMAIL_ALLOWLIST' ? email : undefined };

describe('관리자 계정 생성 경계', () => {
  it('허용 이메일의 공개 가입은 저장과 토큰 발급 전에 차단한다', async () => {
    const users = { findOne: jest.fn().mockResolvedValue(null), create: jest.fn(x => x), save: jest.fn().mockResolvedValue({ email }) };
    const jwt = { signAsync: jest.fn().mockResolvedValue('synthetic') };
    await expect(new AuthService(users as never, jwt as never, config as never)
      .signup({ email: ' OPERATOR@EXAMPLE.TEST ', nickname: 'tester', password })).rejects.toThrow();
    expect(users.save).not.toHaveBeenCalled();
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });

  it('일반 이메일의 공개 가입은 유지한다', async () => {
    const users = { findOne: jest.fn().mockResolvedValue(null), create: jest.fn(x => x), save: jest.fn(async x => ({ ...x, id: 'user' })) };
    const jwt = { signAsync: jest.fn().mockResolvedValue('synthetic') };
    const result = await new AuthService(users as never, jwt as never, config as never)
      .signup({ email: 'member@example.test', nickname: 'tester', password });
    expect(result.user.isAdmin).toBe(false);
    expect(users.save).toHaveBeenCalledTimes(1);
  });

  it('허용된 새 계정만 해시로 삽입하고 관리자 가드를 통과한다', async () => {
    const users = { findOne: jest.fn().mockResolvedValue(null), insert: jest.fn().mockResolvedValue({}) };
    await createAdminAccount(users as never, email, { email: email.toUpperCase(), nickname: 'operator', password });
    const stored = users.insert.mock.calls[0][0];
    expect(stored.email).toBe(email);
    expect(stored.password).toBeUndefined();
    expect(await bcrypt.compare(password, stored.passwordHash)).toBe(true);
    const guard = new AdminEmailGuard(config as never);
    const context = (value: string) => ({ switchToHttp: () => ({ getRequest: () => ({ user: { email: value } }) }) }) as never;
    expect(guard.canActivate(context(email))).toBe(true);
    expect(() => guard.canActivate(context('member@example.test'))).toThrow();
  });

  it('기존 계정은 비밀번호 변경이나 자동 승격 없이 거부한다', async () => {
    const users = { findOne: jest.fn().mockResolvedValue({ email, passwordHash: 'unchanged' }), insert: jest.fn() };
    await expect(createAdminAccount(users as never, email, { email, nickname: 'operator', password })).rejects.toThrow();
    expect(users.insert).not.toHaveBeenCalled();
  });

  it('허용되지 않은 주소와 짧은 비밀번호는 DB 쓰기 전에 거부한다', async () => {
    const users = { findOne: jest.fn(), insert: jest.fn() };
    for (const [allowlist, value] of [['', password], [email, 'short']]) {
      await expect(createAdminAccount(users as never, allowlist, { email, nickname: 'operator', password: value })).rejects.toThrow();
    }
    expect(users.insert).not.toHaveBeenCalled();
  });

  it('동시 생성의 unique 충돌은 계정이나 SQL 내용을 노출하지 않는다', async () => {
    const users = { findOne: jest.fn().mockResolvedValue(null), insert: jest.fn().mockRejectedValue(new Error('sensitive database details')) };
    await expect(createAdminAccount(users as never, email, { email, nickname: 'operator', password })).rejects.toThrow('관리자 계정을 생성하지 못했습니다.');
  });
});
