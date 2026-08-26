import { MigrationInterface, QueryRunner } from 'typeorm';
import { chunkTextFtsExpression, documentTitleFtsExpression } from '../fts-expressions';

export class CreateRagFtsGinIndexes1787719500000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_document_chunks_fts" ON document_chunks USING GIN (${chunkTextFtsExpression()})`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_documents_title_fts" ON documents USING GIN (${documentTitleFtsExpression()})`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_documents_title_fts"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_document_chunks_fts"');
  }
}
