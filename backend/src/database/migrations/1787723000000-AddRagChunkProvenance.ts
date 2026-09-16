import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRagChunkProvenance1787723000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE documents ADD COLUMN IF NOT EXISTS "chunkingVersion" varchar NULL');
    await queryRunner.query('ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS "chunkingVersion" varchar NULL');
    await queryRunner.query('ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS "documentTitle" varchar NULL');
    await queryRunner.query('ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS "sourceUrl" varchar NULL');
    await queryRunner.query('ALTER TABLE rag_reindex_jobs ADD COLUMN IF NOT EXISTS "chunkingVersion" varchar NULL');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE rag_reindex_jobs DROP COLUMN IF EXISTS "chunkingVersion"');
    await queryRunner.query('ALTER TABLE document_chunks DROP COLUMN IF EXISTS "sourceUrl"');
    await queryRunner.query('ALTER TABLE document_chunks DROP COLUMN IF EXISTS "documentTitle"');
    await queryRunner.query('ALTER TABLE document_chunks DROP COLUMN IF EXISTS "chunkingVersion"');
    await queryRunner.query('ALTER TABLE documents DROP COLUMN IF EXISTS "chunkingVersion"');
  }
}
