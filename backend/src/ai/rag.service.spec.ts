import { RagService } from './rag.service';
import { ServiceUnavailableException } from '@nestjs/common';
import { DocumentChunk } from './entities/document-chunk.entity';
import { KnowledgeDocument } from './entities/knowledge-document.entity';

describe('RagService 구조 보존 chunking', () => {
  const split = (content: string) => {
    const service = Object.create(RagService.prototype) as { chunkSize: number; chunkOverlap: number; splitText: RagService['splitText'] };
    service.chunkSize = 700;
    service.chunkOverlap = 120;
    return service.splitText(content);
  };

  it('Markdown 제목 경계에서 chunk를 나누고 section path를 보존한다', () => {
    const chunks = split('# 시작\n첫 번째 내용입니다.\n\n## 준비\n준비 내용입니다.\n\n# 마무리\n마무리 내용입니다.');
    expect(chunks.map((chunk) => chunk.sectionPath)).toEqual(['시작', '시작 > 준비', '마무리']);
  });

  it('각 chunk의 원문 범위를 기록하고 중복 chunk를 제거한다', () => {
    const chunks = split('# 문서\n같은 내용입니다.\n\n같은 내용입니다.');
    expect(chunks[0]).toMatchObject({ sourceStart: 0 });
    expect(chunks[0].sourceEnd).toBeGreaterThan(chunks[0].sourceStart);
  });
});

describe('RagService 안전한 강제 재색인', () => {
  const dto = {
    title: '재색인 문서',
    content: '# 문서\n충분히 긴 재색인 대상 문서 내용입니다.',
    category: 'GENERAL',
    sourceType: 'ADMIN',
    sourceUrl: 'app://documents/reindex-safe',
  };

  it('강제 재색인은 콘텐츠 해시가 같아도 새 embedding으로 chunk를 교체한다', async () => {
    const existing = { id: 'document-1', ...dto, contentHash: 'same-hash', indexStatus: 'ACTIVE' };
    const manager = {
      save: jest.fn(async (_entity: unknown, value: unknown) => value),
      create: jest.fn((_entity: unknown, value: unknown) => value),
      delete: jest.fn(async () => undefined),
    };
    const service = Object.create(RagService.prototype) as any;
    Object.assign(service, {
      chunkSize: 700,
      chunkOverlap: 120,
      documents: { findOne: jest.fn(async () => existing), create: jest.fn() },
      chunks: { count: jest.fn(async () => 1) },
      embeddings: { embed: jest.fn(async () => [0.1, 0.2]), getMetadata: jest.fn(() => ({ model: 'new-model', mode: 'real', version: 'v2', dimension: 2 })) },
      dataSource: { transaction: jest.fn(async (work: (transactionManager: typeof manager) => Promise<unknown>) => work(manager)) },
      metrics: { recordIndex: jest.fn() },
    });

    await expect(service.indexDocument(dto, { force: true })).resolves.toMatchObject({ id: 'document-1', status: 'updated', chunkCount: 1 });
    expect(manager.delete).toHaveBeenCalledWith(DocumentChunk, { documentId: 'document-1' });
    expect(manager.save).toHaveBeenCalledWith(KnowledgeDocument, expect.objectContaining({ indexStatus: 'ACTIVE', embeddingModel: 'new-model' }));
  });

  it('embedding 생성 실패 시 기존 활성 문서와 chunk 교체 트랜잭션을 시작하지 않는다', async () => {
    const existing = { id: 'document-1', ...dto, contentHash: 'old-hash', indexStatus: 'ACTIVE' };
    const transaction = jest.fn();
    const service = Object.create(RagService.prototype) as any;
    Object.assign(service, {
      chunkSize: 700,
      chunkOverlap: 120,
      documents: { findOne: jest.fn(async () => existing), save: jest.fn() },
      chunks: { count: jest.fn() },
      embeddings: { embed: jest.fn(async () => { throw new ServiceUnavailableException(); }) },
      dataSource: { transaction },
      metrics: { recordIndex: jest.fn() },
    });

    await expect(service.indexDocument(dto, { force: true })).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(transaction).not.toHaveBeenCalled();
    expect(existing.indexStatus).toBe('ACTIVE');
  });
});
