import type { RagSearchResult } from '../rag.service';
import type { LegacyBaselineRepository } from './rag-retrieval-collector';

export interface ReadOnlyQueryExecutor {
  query(sql: string, parameters?: unknown[]): Promise<unknown>;
}

export interface LegacyEmbeddingMetadata {
  model: string;
  mode: string;
  version: string;
  dimension: number;
}

export class ReadOnlyRagCollectorRepository implements LegacyBaselineRepository {
  constructor(
    private readonly executor: ReadOnlyQueryExecutor,
    private readonly embedding: LegacyEmbeddingMetadata = {
      model: 'text-embedding-3-small', mode: 'real', version: 'v1', dimension: 1536,
    },
  ) {}

  async query(sql: string, parameters: unknown[] = []) {
    if (!/^\s*(SELECT|WITH)\b/i.test(sql)) throw new Error('RAG 비교 수집기는 읽기 전용 SELECT/WITH 조회만 허용합니다.');
    return this.executor.query(sql, parameters);
  }

  async vectorSearch(embedding: number[], limit: number): Promise<RagSearchResult[]> {
    return this.query(
      `
      SELECT
        c.id AS "chunkId",
        c."documentId" AS "documentId",
        d.title AS title,
        d.category AS category,
        d."sourceUrl" AS "sourceUrl",
        c."chunkText" AS "chunkText",
        c."sectionPath" AS "sectionPath",
        1 - (c.embedding <=> $1::vector) AS score
      FROM document_chunks c
      INNER JOIN documents d ON d.id = c."documentId"
      WHERE c.embedding IS NOT NULL
        AND d."indexStatus" = 'ACTIVE'
        AND d."embeddingModel" = $3
        AND d."embeddingMode" = $4
        AND d."embeddingVersion" = $5
        AND d."embeddingDimension" = $6
      ORDER BY c.embedding <=> $1::vector
      LIMIT $2
      `,
      [`[${embedding.join(',')}]`, limit, this.embedding.model, this.embedding.mode, this.embedding.version, this.embedding.dimension],
    ) as Promise<RagSearchResult[]>;
  }

  async latestBoardPostChunks(limit: number): Promise<RagSearchResult[]> {
    return this.query(
      `
      SELECT
        c.id AS "chunkId",
        c."documentId" AS "documentId",
        d.title AS title,
        d.category AS category,
        d."sourceUrl" AS "sourceUrl",
        c."chunkText" AS "chunkText",
        c."sectionPath" AS "sectionPath",
        0 AS score
      FROM document_chunks c
      INNER JOIN documents d ON d.id = c."documentId"
      WHERE d.category = 'BOARD_POST'
      ORDER BY c."createdAt" DESC
      LIMIT $1
      `,
      [limit],
    ) as Promise<RagSearchResult[]>;
  }
}
