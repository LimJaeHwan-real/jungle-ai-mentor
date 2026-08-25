import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';
import { EmbeddingService } from './embedding.service';

function service(values: Record<string, string | undefined>) {
  return new EmbeddingService({ get: jest.fn((key: string) => values[key]) } as unknown as ConfigService);
}

describe('EmbeddingService 운영 정책', () => {
  it('production에서 API 키가 없으면 시작을 거부한다', () => {
    const target = service({ RAG_RUNTIME_ENV: 'production', RAG_EMBEDDING_MODE: 'real' });
    expect(() => target.onModuleInit()).toThrow('OPENAI_API_KEY');
  });

  it('demo의 명시적 mock 모드만 deterministic embedding을 생성한다', async () => {
    const target = service({ RAG_RUNTIME_ENV: 'demo', RAG_EMBEDDING_MODE: 'mock' });
    target.onModuleInit();
    await expect(target.embed('정글 알고리즘')).resolves.toHaveLength(1536);
  });

  it('local real 모드에서 키가 없으면 mock으로 자동 전환하지 않는다', async () => {
    const target = service({ RAG_RUNTIME_ENV: 'local', RAG_EMBEDDING_MODE: 'real' });
    await expect(target.embed('정글 알고리즘')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('production mock 모드는 시작을 거부한다', () => {
    const target = service({ RAG_RUNTIME_ENV: 'production', RAG_EMBEDDING_MODE: 'mock', OPENAI_API_KEY: 'configured' });
    expect(() => target.onModuleInit()).toThrow('demo 또는 local');
  });
});
