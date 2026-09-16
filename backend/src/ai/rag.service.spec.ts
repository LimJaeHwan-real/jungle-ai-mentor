import { RagService } from './rag.service';
import { ServiceUnavailableException } from '@nestjs/common';
import { DocumentChunk } from './entities/document-chunk.entity';
import { KnowledgeDocument } from './entities/knowledge-document.entity';
import { createHash } from 'crypto';
import { getEncoding } from 'js-tiktoken';

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

  it('같은 문장이라도 다른 섹션에 있으면 두 근거를 모두 남긴다', () => {
    const service = Object.create(RagService.prototype) as any;
    service.chunkTokenLimit = 40;
    const repeated = '반복되는 설명입니다. '.repeat(30);
    const chunks = service.splitText(`# 첫째\n${repeated}\n# 둘째\n${repeated}`);
    const first = chunks.filter((chunk: { sectionPath: string }) => chunk.sectionPath === '첫째').map((chunk: { chunkText: string }) => chunk.chunkText);
    const second = chunks.filter((chunk: { sectionPath: string }) => chunk.sectionPath === '둘째').map((chunk: { chunkText: string }) => chunk.chunkText);
    expect(first.some((text: string) => second.includes(text))).toBe(true);
  });

  it('실제 임베딩 토큰 수로 chunk 크기를 제한하고 tokenCount를 기록한다', () => {
    const service = Object.create(RagService.prototype) as any;
    service.chunkTokenLimit = 64;
    const chunks = service.splitText('# 학습\n' + '한글 문장을 복기합니다. '.repeat(120));
    const encoding = getEncoding('cl100k_base');

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      const actual = encoding.encode(chunk.chunkText).length;
      expect(actual).toBeLessThanOrEqual(64);
      expect(chunk.tokenCount).toBe(actual);
    }
  });

  it('CRLF 문서의 원문 범위와 section path를 정확히 보존한다', () => {
    const content = '# 시작\r\n첫 문단입니다.\r\n\r\n## 준비\r\n- 목록 첫째\r\n- 목록 둘째\r\n';
    const chunks = split(content);

    expect(chunks.map((chunk) => chunk.sectionPath)).toEqual(['시작', '시작 > 준비']);
    for (const chunk of chunks) expect(content.slice(chunk.sourceStart, chunk.sourceEnd)).toBe(chunk.chunkText);
  });

  it('코드 블록과 표의 행을 가능한 한 온전하게 유지한다', () => {
    const service = Object.create(RagService.prototype) as any;
    service.chunkTokenLimit = 48;
    const code = '```ts\nconst a = 1;\nconst b = 2;\n```';
    const table = '| 항목 | 값 |\n| --- | --- |\n| A | 1 |\n| B | 2 |';
    const content = `# 자료\n설명입니다.\n\n${code}\n\n${table}\n\n마지막 문단입니다.`;
    const chunks = service.splitText(content);

    expect(chunks.some((chunk: { chunkText: string }) => chunk.chunkText.includes(code))).toBe(true);
    expect(chunks.some((chunk: { chunkText: string }) => chunk.chunkText.includes(table))).toBe(true);
    for (const chunk of chunks) expect(chunk.tokenCount).toBeLessThanOrEqual(48);
  });

  it('코드 블록 안의 # 문장을 제목으로 해석하지 않는다', () => {
    const content = '# 실제 제목\n```md\n# 코드 안의 문자\n그대로 보존\n```\n본문입니다.\n## 다음 제목\n다음 본문입니다.';
    const chunks = split(content);
    expect(chunks.map((chunk) => chunk.sectionPath)).toEqual(['실제 제목', '실제 제목 > 다음 제목']);
    expect(chunks[0].chunkText).toContain('```md\n# 코드 안의 문자\n그대로 보존\n```');
  });

  it('제목이나 공백만 있는 문서는 색인할 본문이 없는 것으로 판정한다', () => {
    expect(split('  \r\n\r\n')).toEqual([]);
    expect(split('# 제목만 있는 문서')).toEqual([]);
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
    expect(manager.save).toHaveBeenCalledWith(KnowledgeDocument, expect.objectContaining({ indexStatus: 'ACTIVE', embeddingModel: 'new-model', chunkingVersion: 'markdown-cl100k-256-v2' }));
    expect(manager.create).toHaveBeenCalledWith(DocumentChunk, expect.objectContaining({ documentTitle: dto.title, sourceUrl: dto.sourceUrl, chunkingVersion: 'markdown-cl100k-256-v2' }));
  });

  it('source URL이 없는 관리자 문서도 원래 ID의 chunk를 교체한다', async () => {
    const existing = { id: 'document-1', ...dto, sourceUrl: undefined, contentHash: 'old-hash', indexStatus: 'ACTIVE' };
    const manager = {
      save: jest.fn(async (_entity: unknown, value: unknown) => value),
      create: jest.fn((_entity: unknown, value: unknown) => value),
      delete: jest.fn(async () => undefined),
    };
    const service = Object.create(RagService.prototype) as any;
    Object.assign(service, {
      documents: { findOne: jest.fn(async () => existing), create: jest.fn(() => ({ id: 'new-document' })) },
      embeddings: { embed: jest.fn(async () => [0.1, 0.2]), getMetadata: jest.fn(() => ({ provider: 'openai', model: 'text-embedding-3-small', mode: 'real', version: 'v1', dimension: 2 })) },
      dataSource: { transaction: jest.fn(async (work: (transactionManager: typeof manager) => Promise<unknown>) => work(manager)) },
      metrics: { recordIndex: jest.fn() },
    });

    await expect(service.reindexDocument(existing.id)).resolves.toMatchObject({ id: existing.id, status: 'updated' });
    expect(manager.delete).toHaveBeenCalledWith(DocumentChunk, { documentId: existing.id });
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

  it('내용과 embedding이 같아도 분할 버전이 다르면 재색인한다', async () => {
    const existing = {
      id: 'document-1', ...dto, contentHash: createHash('sha256').update(dto.content).digest('hex'),
      indexStatus: 'ACTIVE', embeddingProvider: 'openai', embeddingModel: 'text-embedding-3-small',
      embeddingMode: 'real', embeddingVersion: 'v1', embeddingDimension: 2, chunkingVersion: 'markdown-v1',
    };
    const manager = {
      save: jest.fn(async (_entity: unknown, value: unknown) => value),
      create: jest.fn((_entity: unknown, value: unknown) => value),
      delete: jest.fn(async () => undefined),
    };
    const service = Object.create(RagService.prototype) as any;
    Object.assign(service, {
      documents: { findOne: jest.fn(async () => existing), create: jest.fn() },
      chunks: { count: jest.fn(async () => 1) },
      embeddings: { embed: jest.fn(async () => [0.1, 0.2]), getMetadata: jest.fn(() => ({ provider: 'openai', model: 'text-embedding-3-small', mode: 'real', version: 'v1', dimension: 2 })) },
      dataSource: { transaction: jest.fn(async (work: (transactionManager: typeof manager) => Promise<unknown>) => work(manager)) },
      metrics: { recordIndex: jest.fn() },
    });

    await expect(service.indexDocument(dto)).resolves.toMatchObject({ status: 'updated' });
    expect(manager.delete).toHaveBeenCalledWith(DocumentChunk, { documentId: existing.id });
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
