import { DataSource } from 'typeorm';
import { RagReindexJob } from './rag-reindex-job.entity';
import { RagReindexJobItem } from './rag-reindex-job-item.entity';

class MetadataDataSource extends DataSource {
  checkMetadata() {
    return this.buildMetadatas();
  }
}

describe('재색인 엔티티 PostgreSQL 메타데이터', () => {
  it('nullable 작업 필드의 컬럼 타입을 DB 연결 없이 구성한다', async () => {
    const dataSource = new MetadataDataSource({ type: 'postgres', entities: [RagReindexJob, RagReindexJobItem], synchronize: false });

    await expect(dataSource.checkMetadata()).resolves.toBeUndefined();
  });
});
