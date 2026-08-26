import { ServiceUnavailableException } from '@nestjs/common';
import { RagReindexService } from './rag-reindex.service';

describe('RagReindexService', () => {
  const job = {
    id: 'job-1',
    status: 'COMPLETED',
    targetCount: 0,
    successCount: 0,
    failureCount: 0,
    duplicateCount: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const createService = () => {
    const jobs = { findOne: jest.fn(async () => job) };
    const items = { find: jest.fn(async () => []) };
    const manager = {
      create: jest.fn((_entity: unknown, value: object) => ({ id: 'job-1', ...value })),
      save: jest.fn(async (_entity: unknown, value: object) => value),
      query: jest.fn(async () => []),
      update: jest.fn(async () => undefined),
    };
    const dataSource = {
      transaction: jest.fn(async (work: (transactionManager: typeof manager) => Promise<unknown>) => work(manager)),
      query: jest.fn(async () => undefined),
    };
    const rag = {
      findReindexTargetDocuments: jest.fn(async () => [{ id: 'document-1' }]),
      reindexDocument: jest.fn(async () => undefined),
    };
    const embeddings = { getMetadata: jest.fn(() => ({ model: 'text-embedding-3-small', mode: 'real', version: 'v1', dimension: 1536 })) };
    return { service: new RagReindexService(jobs as any, items as any, dataSource as any, rag as any, embeddings as any), jobs, items, manager, dataSource, rag };
  };

  it('이미 대기 또는 실행 중인 문서는 중복 항목을 만들지 않고 작업 결과에 표시한다', async () => {
    const { service, manager } = createService();
    jest.spyOn(service as any, 'requestDrain').mockImplementation(() => undefined);

    await expect(service.createJob(['document-1'])).resolves.toMatchObject({ targetCount: 0, duplicateCount: 1 });
    expect(manager.query).toHaveBeenCalledWith(expect.stringContaining('ON CONFLICT ("documentId") WHERE status IN (\'PENDING\', \'RUNNING\') DO NOTHING'), expect.any(Array));
  });

  it('성공한 항목은 성공으로 완료 처리하고, embedding 실패는 안전한 오류로 기록한다', async () => {
    const { service, rag } = createService();
    const complete = jest.spyOn(service as any, 'completeItem').mockResolvedValue(undefined);

    await (service as any).processItem({ id: 'item-1', jobId: 'job-1', documentId: 'document-1' });
    expect(complete).toHaveBeenCalledWith(expect.any(Object), 'SUCCEEDED');

    complete.mockClear();
    rag.reindexDocument.mockRejectedValueOnce(new ServiceUnavailableException());
    await (service as any).processItem({ id: 'item-2', jobId: 'job-1', documentId: 'document-1' });
    expect(complete).toHaveBeenCalledWith(expect.any(Object), 'FAILED', 'EMBEDDING_UNAVAILABLE', '임베딩 서비스를 사용할 수 없어 기존 색인을 유지했습니다.');
  });

  it('완료 집계는 성공·실패 수와 실패 포함 완료 상태를 함께 저장한다', async () => {
    const { service, manager } = createService();
    (manager.query as jest.Mock).mockResolvedValueOnce([{ successCount: 2, failureCount: 1, remainingCount: 0 }]);

    await (service as any).refreshJobSummary(manager, 'job-1');
    expect(manager.update).toHaveBeenCalledWith(expect.anything(), 'job-1', expect.objectContaining({ status: 'COMPLETED_WITH_FAILURES', successCount: 2, failureCount: 1 }));
  });

  it('운영자 조회에는 작업 집계와 문서별 안전한 실패 원인이 포함된다', async () => {
    const { service, jobs, items } = createService();
    jobs.findOne.mockResolvedValueOnce({ ...job, status: 'COMPLETED_WITH_FAILURES', targetCount: 1, failureCount: 1 });
    (items.find as jest.Mock).mockResolvedValueOnce([
      {
        documentId: 'document-1',
        status: 'FAILED',
        errorCode: 'EMBEDDING_UNAVAILABLE',
        errorMessage: '임베딩 서비스를 사용할 수 없어 기존 색인을 유지했습니다.',
      },
    ]);

    await expect(service.getJob('job-1')).resolves.toMatchObject({
      targetCount: 1,
      failureCount: 1,
      items: [expect.objectContaining({ errorCode: 'EMBEDDING_UNAVAILABLE' })],
    });
  });
});
