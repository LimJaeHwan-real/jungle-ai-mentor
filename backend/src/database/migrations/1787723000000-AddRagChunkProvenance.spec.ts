import dataSource from '../data-source';
import { AddRagChunkProvenance1787723000000 } from './1787723000000-AddRagChunkProvenance';

describe('RAG chunk provenance migration', () => {
  it('기존 행을 지우지 않고 분할 버전과 문서 출처를 저장할 컬럼을 추가한다', async () => {
    const query = jest.fn();
    await new AddRagChunkProvenance1787723000000().up({ query } as never);
    const sql = query.mock.calls.map(([statement]) => statement).join('\n');

    expect(sql).toContain('ALTER TABLE documents ADD COLUMN IF NOT EXISTS "chunkingVersion"');
    expect(sql).toContain('ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS "documentTitle"');
    expect(sql).toContain('ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS "sourceUrl"');
    expect(sql).toContain('ALTER TABLE rag_reindex_jobs ADD COLUMN IF NOT EXISTS "chunkingVersion"');
    expect(sql).not.toMatch(/DELETE FROM|TRUNCATE|DROP TABLE/i);
    expect(dataSource.options.migrations).toContain(AddRagChunkProvenance1787723000000);
  });

  it('되돌릴 때 이번 컬럼만 제거한다', async () => {
    const query = jest.fn();
    await new AddRagChunkProvenance1787723000000().down({ query } as never);
    const sql = query.mock.calls.map(([statement]) => statement).join('\n');
    expect(sql).toContain('ALTER TABLE documents DROP COLUMN IF EXISTS "chunkingVersion"');
    expect(sql).toContain('ALTER TABLE document_chunks DROP COLUMN IF EXISTS "documentTitle"');
    expect(sql).not.toMatch(/DELETE FROM|TRUNCATE|DROP TABLE/i);
  });
});
