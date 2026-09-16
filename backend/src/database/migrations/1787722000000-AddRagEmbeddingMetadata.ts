import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRagEmbeddingMetadata1787722000000 implements MigrationInterface {
  private readonly documentColumns = [
    ['embeddingProvider', 'varchar'],
    ['embeddingGeneratedAt', 'timestamp'],
    ['indexedAt', 'timestamp'],
    ['indexErrorCode', 'varchar'],
  ] as const;

  private readonly chunkColumns = [
    ['embeddingProvider', 'varchar'],
    ['embeddingModel', 'varchar'],
    ['embeddingDimension', 'integer'],
    ['embeddingMode', 'varchar'],
    ['embeddingVersion', 'varchar'],
    ['embeddingGeneratedAt', 'timestamp'],
    ['indexedAt', 'timestamp'],
    ['indexStatus', 'varchar'],
    ['indexErrorCode', 'varchar'],
  ] as const;

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const [name, type] of this.documentColumns) {
      await queryRunner.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS "${name}" ${type} NULL`);
    }
    for (const [name, type] of this.chunkColumns) {
      await queryRunner.query(`ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS "${name}" ${type} NULL`);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const [name] of [...this.chunkColumns].reverse()) {
      await queryRunner.query(`ALTER TABLE document_chunks DROP COLUMN IF EXISTS "${name}"`);
    }
    for (const [name] of [...this.documentColumns].reverse()) {
      await queryRunner.query(`ALTER TABLE documents DROP COLUMN IF EXISTS "${name}"`);
    }
  }
}
