import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRagReindexJobs1787721000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS rag_reindex_jobs (
      id uuid PRIMARY KEY,
      status varchar NOT NULL DEFAULT 'QUEUED',
      "targetCount" integer NOT NULL DEFAULT 0,
      "successCount" integer NOT NULL DEFAULT 0,
      "failureCount" integer NOT NULL DEFAULT 0,
      "duplicateCount" integer NOT NULL DEFAULT 0,
      "embeddingModel" varchar NULL,
      "embeddingMode" varchar NULL,
      "embeddingVersion" varchar NULL,
      "embeddingDimension" integer NULL,
      "startedAt" TIMESTAMP NULL,
      "finishedAt" TIMESTAMP NULL,
      "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
    )`);
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS rag_reindex_job_items (
      id uuid PRIMARY KEY,
      "jobId" uuid NOT NULL REFERENCES rag_reindex_jobs(id) ON DELETE CASCADE,
      "documentId" uuid NULL,
      status varchar NOT NULL DEFAULT 'PENDING',
      "errorCode" varchar NULL,
      "errorMessage" text NULL,
      "startedAt" TIMESTAMP NULL,
      "finishedAt" TIMESTAMP NULL,
      "leaseUntil" TIMESTAMP NULL,
      "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
    )`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_rag_reindex_job_items_job" ON rag_reindex_job_items ("jobId")`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_rag_reindex_active_document" ON rag_reindex_job_items ("documentId") WHERE status IN ('PENDING', 'RUNNING')`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "UQ_rag_reindex_active_document"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_rag_reindex_job_items_job"');
    await queryRunner.query('DROP TABLE IF EXISTS rag_reindex_job_items');
    await queryRunner.query('DROP TABLE IF EXISTS rag_reindex_jobs');
  }
}
