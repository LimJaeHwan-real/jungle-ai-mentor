import dataSource from '../data-source';
import { AddRagEmbeddingMetadata1787722000000 } from './1787722000000-AddRagEmbeddingMetadata';

describe('RAG embedding metadata migration', () => {
  it('기존 문서와 chunk를 유지하며 메타데이터 컬럼을 추가한다', async () => {
    const query = jest.fn();
    await new AddRagEmbeddingMetadata1787722000000().up({ query } as never);
    const sql = query.mock.calls.map(([statement]) => statement).join('\n');

    expect(sql).toContain('ALTER TABLE documents ADD COLUMN IF NOT EXISTS "embeddingProvider"');
    expect(sql).toContain('ALTER TABLE documents ADD COLUMN IF NOT EXISTS "indexedAt"');
    expect(sql).toContain('ALTER TABLE documents ADD COLUMN IF NOT EXISTS "indexErrorCode"');
    expect(sql).toContain('ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS "embeddingProvider"');
    expect(sql).toContain('ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS "embeddingVersion"');
    expect(sql).not.toMatch(/DELETE FROM|TRUNCATE|DROP TABLE/i);
    expect(dataSource.options.migrations).toContain(AddRagEmbeddingMetadata1787722000000);
  });

  it('되돌릴 때 이번에 추가한 컬럼만 제거한다', async () => {
    const query = jest.fn();
    await new AddRagEmbeddingMetadata1787722000000().down({ query } as never);
    const sql = query.mock.calls.map(([statement]) => statement).join('\n');

    expect(sql).toContain('ALTER TABLE documents DROP COLUMN IF EXISTS "embeddingProvider"');
    expect(sql).toContain('ALTER TABLE document_chunks DROP COLUMN IF EXISTS "embeddingProvider"');
    expect(sql).not.toMatch(/DELETE FROM|TRUNCATE|DROP TABLE/i);
  });
});
