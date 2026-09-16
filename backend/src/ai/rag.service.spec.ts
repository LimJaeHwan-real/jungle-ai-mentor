import { RagService } from './rag.service';
import { ServiceUnavailableException } from '@nestjs/common';
import { DocumentChunk } from './entities/document-chunk.entity';
import { KnowledgeDocument } from './entities/knowledge-document.entity';
import { createHash } from 'crypto';

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

  it('내용이 같아도 embedding 버전이 다르면 새 색인을 만든다', async () => {
    const existing = { id: 'document-1', ...dto, contentHash: createHash('sha256').update(dto.content).digest('hex'), indexStatus: 'ACTIVE', embeddingVersion: 'v1' };
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
      embeddings: { embed: jest.fn(async () => [0.1, 0.2]), getMetadata: jest.fn(() => ({ provider: 'openai', model: 'text-embedding-3-small', mode: 'real', version: 'v2', dimension: 2 })) },
      dataSource: { transaction: jest.fn(async (work: (transactionManager: typeof manager) => Promise<unknown>) => work(manager)) },
      metrics: { recordIndex: jest.fn() },
    });

    await expect(service.indexDocument(dto)).resolves.toMatchObject({ status: 'updated' });
    expect(manager.delete).toHaveBeenCalledWith(DocumentChunk, { documentId: existing.id });
    expect(manager.save).toHaveBeenCalledWith(KnowledgeDocument, expect.objectContaining({ embeddingVersion: 'v2', embeddingProvider: 'openai', indexStatus: 'ACTIVE' }));
    expect(manager.create).toHaveBeenCalledWith(DocumentChunk, expect.objectContaining({ embeddingProvider: 'openai', embeddingVersion: 'v2', indexStatus: 'ACTIVE', embeddingGeneratedAt: expect.any(Date) }));
  });

  it('embedding 생성 실패 시 기존 활성 문서와 chunk 교체 트랜잭션을 시작하지 않는다', async () => {
    const existing = { id: 'document-1', ...dto, contentHash: 'old-hash', indexStatus: 'ACTIVE' };
    const transaction = jest.fn();
    const service = Object.create(RagService.prototype) as any;
    Object.assign(service, {
      chunkSize: 700,
      chunkOverlap: 120,
      documents: { findOne: jest.fn(async () => existing), update: jest.fn() },
      chunks: { count: jest.fn() },
      embeddings: { embed: jest.fn(async () => { throw new ServiceUnavailableException(); }), getMetadata: jest.fn(() => ({ provider: 'openai', model: 'text-embedding-3-small', mode: 'real', version: 'v1', dimension: 1536 })) },
      dataSource: { transaction },
      metrics: { recordIndex: jest.fn() },
    });

    await expect(service.indexDocument(dto, { force: true })).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(transaction).not.toHaveBeenCalled();
    expect(existing.indexStatus).toBe('ACTIVE');
    expect(service.documents.update).toHaveBeenCalledWith(existing.id, { indexErrorCode: 'EMBEDDING_UNAVAILABLE' });
  });

  it('첫 색인 실패는 안전한 오류 코드와 FAILED 상태를 남긴다', async () => {
    const save = jest.fn(async (document: unknown) => document);
    const service = Object.create(RagService.prototype) as any;
    Object.assign(service, {
      chunkSize: 700,
      chunkOverlap: 120,
      documents: { findOne: jest.fn(async () => null), create: jest.fn((value) => value), save },
      embeddings: { embed: jest.fn(async () => { throw new ServiceUnavailableException(); }), getMetadata: jest.fn(() => ({ provider: 'openai', model: 'text-embedding-3-small', mode: 'real', version: 'v1', dimension: 1536 })) },
      metrics: { recordIndex: jest.fn() },
    });

    await expect(service.indexDocument(dto)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ indexStatus: 'FAILED', indexErrorCode: 'EMBEDDING_UNAVAILABLE' }));
  });
});
