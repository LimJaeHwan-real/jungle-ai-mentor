import dataSource from '../data-source';
import { chunkTextFtsExpression, documentTitleFtsExpression } from '../fts-expressions';
import { CreateRagFtsGinIndexes1787719500000 } from './1787719500000-CreateRagFtsGinIndexes';

describe('CreateRagFtsGinIndexes1787719500000', () => {
  it('배포 마이그레이션으로 재실행 가능한 두 FTS GIN 인덱스를 생성한다', async () => {
    const query = jest.fn();
    const migration = new CreateRagFtsGinIndexes1787719500000();

    await migration.up({ query } as never);

    expect(query).toHaveBeenNthCalledWith(
      1,
      `CREATE INDEX IF NOT EXISTS "IDX_document_chunks_fts" ON document_chunks USING GIN (${chunkTextFtsExpression()})`,
    );
    expect(query).toHaveBeenNthCalledWith(
      2,
      `CREATE INDEX IF NOT EXISTS "IDX_documents_title_fts" ON documents USING GIN (${documentTitleFtsExpression()})`,
    );
  });

  it('이번 마이그레이션이 만든 인덱스만 안전하게 되돌린다', async () => {
    const query = jest.fn();
    const migration = new CreateRagFtsGinIndexes1787719500000();

    await migration.down({ query } as never);

    expect(query.mock.calls).toEqual([
      ['DROP INDEX IF EXISTS "IDX_documents_title_fts"'],
      ['DROP INDEX IF EXISTS "IDX_document_chunks_fts"'],
    ]);
  });

  it('배포용 DataSource에 마이그레이션이 등록되어 있다', () => {
    expect(dataSource.options.synchronize).toBe(false);
    expect(dataSource.options.migrations).toContain(CreateRagFtsGinIndexes1787719500000);
  });
});
