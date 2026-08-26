import dataSource from '../data-source';
import { CreateRagReindexJobs1787721000000 } from './1787721000000-CreateRagReindexJobs';

describe('CreateRagReindexJobs1787721000000', () => {
  it('작업 이력과 문서별 활성 작업 중복 방지 인덱스를 만든다', async () => {
    const query = jest.fn();
    await new CreateRagReindexJobs1787721000000().up({ query } as never);

    expect(query.mock.calls.join('\n')).toContain('CREATE TABLE IF NOT EXISTS rag_reindex_jobs');
    expect(query.mock.calls.join('\n')).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "UQ_rag_reindex_active_document"');
    expect(query.mock.calls.join('\n')).toContain("status IN ('PENDING', 'RUNNING')");
  });

  it('배포용 DataSource에 등록되어 있다', () => {
    expect(dataSource.options.migrations).toContain(CreateRagReindexJobs1787721000000);
  });
});
