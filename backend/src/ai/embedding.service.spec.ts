import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';
import { EmbeddingService } from './embedding.service';

function service(values: Record<string, string | undefined>) {
  return new EmbeddingService({ get: jest.fn((key: string) => values[key]) } as unknown as ConfigService);
}

describe('EmbeddingService 운영 정책', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

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

  it('429와 5xx 응답은 두 번까지 다시 요청한 뒤 실제 embedding을 반환한다', async () => {
    const request = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce({ ok: false, status: 429 } as Response)
      .mockResolvedValueOnce({ ok: false, status: 503 } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [{ embedding: [0.1, 0.2] }] }) } as Response);
    const target = service({ RAG_RUNTIME_ENV: 'production', OPENAI_API_KEY: 'configured', RAG_EMBEDDING_DIMENSION: '2' });

    await expect(target.embed('정글 질문')).resolves.toEqual([0.1, 0.2]);
    expect(request).toHaveBeenCalledTimes(3);
  });

  it('일반 4xx 응답은 다시 요청하지 않는다', async () => {
    const request = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 400 } as Response);
    const target = service({ RAG_RUNTIME_ENV: 'production', OPENAI_API_KEY: 'configured', RAG_EMBEDDING_DIMENSION: '2' });

    await expect(target.embed('정글 질문')).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('네트워크 오류는 다시 요청하지만 mock embedding으로 전환하지 않는다', async () => {
    const request = jest.spyOn(global, 'fetch')
      .mockRejectedValueOnce(new TypeError('network unavailable'))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [{ embedding: [0.3, 0.4] }] }) } as Response);
    const target = service({ RAG_RUNTIME_ENV: 'production', OPENAI_API_KEY: 'configured', RAG_EMBEDDING_DIMENSION: '2' });

    await expect(target.embed('정글 질문')).resolves.toEqual([0.3, 0.4]);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('예상치 못한 내부 오류는 재시도하지 않는다', async () => {
    const request = jest.spyOn(global, 'fetch')
      .mockRejectedValueOnce(new Error('unexpected failure'))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [{ embedding: [0.3, 0.4] }] }) } as Response);
    const target = service({ RAG_RUNTIME_ENV: 'production', OPENAI_API_KEY: 'configured', RAG_EMBEDDING_DIMENSION: '2' });

    await expect(target.embed('정글 질문')).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('잘못된 embedding 응답은 재시도하거나 mock으로 바꾸지 않는다', async () => {
    const request = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [{ embedding: 'ab' }] }) } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: [{ embedding: [0.1, 0.2] }] }) } as Response);
    const target = service({ RAG_RUNTIME_ENV: 'production', OPENAI_API_KEY: 'configured', RAG_EMBEDDING_DIMENSION: '2' });

    await expect(target.embed('정글 질문')).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('응답이 없으면 요청마다 30초 뒤 중단하고 두 번만 재시도한다', async () => {
    jest.useFakeTimers();
    const request = jest.spyOn(global, 'fetch').mockImplementation((_url, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }));
    const target = service({ RAG_RUNTIME_ENV: 'production', OPENAI_API_KEY: 'configured', RAG_EMBEDDING_DIMENSION: '2' });

    const embedding = target.embed('정글 질문');
    const failure = expect(embedding).rejects.toBeInstanceOf(ServiceUnavailableException);
    await jest.advanceTimersByTimeAsync(90_750);

    expect(request).toHaveBeenCalledTimes(3);
    expect(request.mock.calls.every((call) => call[1]?.signal instanceof AbortSignal)).toBe(true);
    await failure;
  });
});
