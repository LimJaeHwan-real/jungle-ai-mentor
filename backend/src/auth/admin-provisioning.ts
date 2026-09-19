import * as bcrypt from 'bcryptjs';
import { isEmail } from 'class-validator';
import { Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { isAdminEmail } from './admin-access';

export async function createAdminAccount(
  users: Pick<Repository<User>, 'findOne' | 'insert'>,
  allowlist: string | undefined,
  input: { email: string; nickname: string; password: string },
): Promise<void> {
  const email = input.email.trim().toLowerCase();
  const nickname = input.nickname.trim();
  if (!isEmail(email) || !isAdminEmail(email, allowlist)) {
    throw new Error('허용된 관리자 이메일만 생성할 수 있습니다.');
  }
  if (nickname.length < 2 || nickname.length > 100 || input.password.length < 12
    || Buffer.byteLength(input.password, 'utf8') > 72) {
    throw new Error('닉네임은 2~100자, 비밀번호는 12자 이상 및 UTF-8 72바이트 이하여야 합니다.');
  }
  try {
    if (await users.findOne({ where: { email } })) {
      throw new Error('existing account');
    }
    const passwordHash = await bcrypt.hash(input.password, 12);
    // INSERT + DB unique constraint: never overwrite an existing account, even in a race.
    await users.insert({ email, nickname, passwordHash });
  } catch {
    throw new Error('관리자 계정을 생성하지 못했습니다. 기존 계정과 DB 상태를 안전하게 확인하세요.');
  }
}
