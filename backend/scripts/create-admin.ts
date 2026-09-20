import 'reflect-metadata';
import { ConfigModule } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { User } from '../src/users/user.entity';
import { createAdminAccount } from '../src/auth/admin-provisioning';
import { readHiddenInput } from '../src/auth/hidden-input';

async function main() {
  if (process.argv.length > 2 || !process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error('interactive terminal required');
  }
  await ConfigModule.forRoot({ envFilePath: ['.env.local', '.env'], isGlobal: false });
  for (const key of ['ADMIN_EMAIL_ALLOWLIST', 'DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME']) {
    if (!process.env[key]?.trim()) throw new Error('explicit configuration required');
  }
  const { createDataSourceOptions } = await import('../src/database/data-source');
  const source = new DataSource({ ...createDataSourceOptions(), synchronize: false,
    migrationsRun: false, installExtensions: false, logging: false } as ConstructorParameters<typeof DataSource>[0]);
  try {
    process.stdout.write('서버와 DB 대상을 직접 확인한 운영자만 실행하세요. 기존 계정은 변경하지 않습니다.\n');
    const email = await readHiddenInput('관리자 이메일 (비표시): ');
    const nickname = await readHiddenInput('닉네임 (비표시): ');
    const password = await readHiddenInput('비밀번호 (12자 이상, 비표시): ');
    if (password !== await readHiddenInput('비밀번호 확인 (비표시): ')) throw new Error('password mismatch');
    if (await readHiddenInput('확인한 DB에 새 계정을 만들려면 CREATE 입력: ') !== 'CREATE') throw new Error('cancelled');
    await source.initialize();
    await createAdminAccount(source.getRepository(User), process.env.ADMIN_EMAIL_ALLOWLIST, { email, nickname, password });
    process.stdout.write('관리자 계정 생성 완료. 계정 정보와 인증값은 출력하지 않습니다.\n');
  } finally {
    if (source.isInitialized) await source.destroy();
  }
}

main().catch(() => {
  process.stderr.write('관리자 생성 중단: 터미널·설정·입력·기존 계정·DB 상태를 확인하세요. 상세 값은 출력하지 않습니다.\n');
  process.exitCode = 1;
});
