import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { Brackets, DataSource, Repository } from 'typeorm';
import { CreateDocumentDto } from './dto/create-document.dto';
import { DocumentChunk } from './entities/document-chunk.entity';
import { KnowledgeDocument } from './entities/knowledge-document.entity';
import { EmbeddingService } from './embedding.service';
import { RagMetricsService } from './rag-metrics.service';
import { chunkTextFtsExpression, documentTitleFtsExpression } from '../database/fts-expressions';

export interface RagSearchResult {
  chunkId: string;
  documentId: string;
  title: string;
  category: string;
  sourceUrl?: string;
  chunkText: string;
  sectionPath?: string;
  sourceStart?: number;
  sourceEnd?: number;
  score: number;
  rerankScore?: number;
}

export type RagRetrievalStatus = 'SUFFICIENT_EVIDENCE' | 'INSUFFICIENT_EVIDENCE' | 'NO_ACTIVE_INDEX' | 'SEARCH_DEGRADED';

export interface RagSearchResponse {
  results: RagSearchResult[];
  status: RagRetrievalStatus;
}

export interface RagIndexResult {
  id: string;
  title: string;
  category: string;
  chunkCount: number;
  contentHash: string;
  status: 'created' | 'updated' | 'skipped';
}

export interface RagReindexTarget {
  id: string;
  title: string;
  category: string;
  indexStatus: string;
  embeddingModel?: string;
  embeddingMode?: string;
  embeddingVersion?: string;
  embeddingDimension?: number;
  updatedAt: Date;
}

@Injectable()
export class RagService {
  private readonly chunkSize = 700;
  private readonly chunkOverlap = 120;

  constructor(
    @InjectRepository(KnowledgeDocument) private readonly documents: Repository<KnowledgeDocument>,
    @InjectRepository(DocumentChunk) private readonly chunks: Repository<DocumentChunk>,
    private readonly embeddings: EmbeddingService,
    private readonly dataSource: DataSource,
    private readonly metrics: RagMetricsService,
  ) {}

  async createDocument(dto: CreateDocumentDto) {
    return this.indexDocument(dto);
  }

  async indexDocument(dto: CreateDocumentDto, options: { force?: boolean } = {}): Promise<RagIndexResult> {
    const contentHash = createHash('sha256').update(dto.content).digest('hex');
    const existing = dto.sourceUrl ? await this.documents.findOne({ where: { sourceUrl: dto.sourceUrl } }) : undefined;

    if (existing?.contentHash === contentHash && !options.force) {
      const chunkCount = await this.chunks.count({ where: { documentId: existing.id } });
      const result: RagIndexResult = {
        id: existing.id,
        title: existing.title,
        category: existing.category,
        chunkCount,
        contentHash,
        status: 'skipped',
      };
      this.metrics.recordIndex(result.status);
      return result;
    }

    const texts = this.splitText(dto.content);
    if (!texts.length) throw new BadRequestException('색인할 수 있는 문서 내용이 없습니다.');
    let vectors: number[][];
    try {
      vectors = await Promise.all(texts.map((chunk) => this.embeddings.embed(chunk.chunkText)));
    } catch (error) {
      if (!existing) await this.documents.save(this.documents.create({ title: dto.title, content: dto.content, category: dto.category ?? 'GENERAL', sourceType: dto.sourceType ?? 'ADMIN', sourceUrl: dto.sourceUrl, contentHash, indexStatus: 'FAILED' }));
      this.metrics.recordIndex('failed');
      throw error;
    }
    const metadata = this.embeddings.getMetadata();
    const document = existing ?? this.documents.create();
    Object.assign(document, {
        title: dto.title,
        content: dto.content,
        category: dto.category ?? 'GENERAL',
        sourceType: dto.sourceType ?? 'ADMIN',
        sourceUrl: dto.sourceUrl,
        contentHash,
        indexStatus: 'ACTIVE', embeddingModel: metadata.model, embeddingMode: metadata.mode, embeddingVersion: metadata.version, embeddingDimension: metadata.dimension,
    });
    const savedDocument = await this.dataSource.transaction(async (manager) => {
      const saved = await manager.save(KnowledgeDocument, document);
      if (existing) await manager.delete(DocumentChunk, { documentId: saved.id });
      const chunks = texts.map((chunk, index) =>
        manager.create(DocumentChunk, {
          documentId: saved.id,
          chunkIndex: index,
          chunkText: chunk.chunkText,
          sectionPath: chunk.sectionPath,
          sourceStart: chunk.sourceStart,
          sourceEnd: chunk.sourceEnd,
          tokenCount: Math.ceil(chunk.chunkText.length / 4),
          embedding: vectors[index],
        }),
      );
      await manager.save(DocumentChunk, chunks);
      return saved;
    });

    const result: RagIndexResult = {
      id: savedDocument.id,
      title: savedDocument.title,
      category: savedDocument.category,
      chunkCount: texts.length,
      contentHash,
      status: existing ? 'updated' : 'created',
    };
    this.metrics.recordIndex(result.status);
    return result;
  }

  async reindexDocument(documentId: string): Promise<RagIndexResult> {
    const document = await this.documents.findOne({ where: { id: documentId } });
    if (!document) throw new NotFoundException('재색인 대상 문서를 찾을 수 없습니다.');
    return this.indexDocument(
      {
        title: document.title,
        content: document.content,
        category: document.category,
        sourceType: document.sourceType,
        sourceUrl: document.sourceUrl,
      },
      { force: true },
    );
  }

  async search(question: string, limit = 4): Promise<RagSearchResult[]> {
    return (await this.searchWithStatus(question, limit)).results;
  }

  async searchWithStatus(question: string, limit = 4): Promise<RagSearchResponse> {
    const startedAt = Date.now();
    try {
      const embedding = await this.embeddings.embed(question);
      const vector = this.embeddings.toSqlVector(embedding);
      const metadata = this.embeddings.getMetadata();
      const rows = (await this.chunks.query(
        `
        SELECT
          c.id AS "chunkId",
          c."documentId" AS "documentId",
          d.title AS title,
          d.category AS category,
          d."sourceUrl" AS "sourceUrl",
          c."chunkText" AS "chunkText",
          c."sectionPath" AS "sectionPath",
          c."sourceStart" AS "sourceStart",
          c."sourceEnd" AS "sourceEnd",
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
        [vector, limit, metadata.model, metadata.mode, metadata.version, metadata.dimension],
      )) as RagSearchResult[];
      const lexicalRows = await this.lexicalSearch(question, limit);
      const results = this.rerankResults(question, this.mergeSearchResults(rows, lexicalRows, limit));
      const status = this.hasSufficientEvidence(results)
        ? 'SUFFICIENT_EVIDENCE'
        : results.length === 0 && !(await this.hasCompatibleActiveIndex(metadata))
          ? 'NO_ACTIVE_INDEX'
          : 'INSUFFICIENT_EVIDENCE';
      return this.completeSearch({ results, status }, startedAt);
    } catch {
      try {
        return this.completeSearch({ results: await this.lexicalSearch(question, limit), status: 'SEARCH_DEGRADED' }, startedAt);
      } catch {
        return this.completeSearch({ results: [], status: 'SEARCH_DEGRADED' }, startedAt);
      }
    }
  }

  async listReindexTargets(limit = 100) {
    const expectedEmbedding = this.embeddings.getMetadata();
    const documents = await this.reindexTargetQuery().take(limit).getMany();

    return { expectedEmbedding, count: documents.length, documents: documents.map((document) => this.toReindexTarget(document)) };
  }

  async findReindexTargetDocuments(documentIds?: string[]) {
    const query = this.reindexTargetQuery();
    if (documentIds?.length) query.andWhere('document.id IN (:...documentIds)', { documentIds: [...new Set(documentIds)] });
    return query.take(100).getMany();
  }

  private async lexicalSearch(question: string, limit: number, category?: string): Promise<RagSearchResult[]> {
    const rows = (await this.chunks.query(
      `
      WITH query AS (
        SELECT websearch_to_tsquery('simple', $1) AS value
      ), matches AS (
        SELECT
          c.id AS "chunkId",
          c."documentId" AS "documentId",
          d.title AS title,
          d.category AS category,
          d."sourceUrl" AS "sourceUrl",
          c."chunkText" AS "chunkText",
          c."sectionPath" AS "sectionPath",
          c."sourceStart" AS "sourceStart",
          c."sourceEnd" AS "sourceEnd",
          ts_rank_cd(${chunkTextFtsExpression('c')}, query.value) AS score
        FROM document_chunks c
        INNER JOIN documents d ON d.id = c."documentId"
        CROSS JOIN query
        WHERE d."indexStatus" = 'ACTIVE'
          AND ${chunkTextFtsExpression('c')} @@ query.value
          AND ($3::text IS NULL OR d.category = $3)

        UNION

        SELECT
          c.id AS "chunkId",
          c."documentId" AS "documentId",
          d.title AS title,
          d.category AS category,
          d."sourceUrl" AS "sourceUrl",
          c."chunkText" AS "chunkText",
          c."sectionPath" AS "sectionPath",
          c."sourceStart" AS "sourceStart",
          c."sourceEnd" AS "sourceEnd",
          ts_rank_cd(${documentTitleFtsExpression('d')}, query.value) AS score
        FROM document_chunks c
        INNER JOIN documents d ON d.id = c."documentId"
        CROSS JOIN query
        WHERE d."indexStatus" = 'ACTIVE'
          AND ${documentTitleFtsExpression('d')} @@ query.value
          AND ($3::text IS NULL OR d.category = $3)
      )
      SELECT *
      FROM (
        SELECT *, row_number() OVER (PARTITION BY "chunkId" ORDER BY score DESC) AS match_rank
        FROM matches
      ) ranked_matches
      WHERE match_rank = 1
      ORDER BY score DESC
      LIMIT $2
      `,
      [question, limit, category ?? null],
    )) as RagSearchResult[];
    return rows.sort((a, b) => b.score - a.score);
  }

  private mergeSearchResults(vectorRows: RagSearchResult[], lexicalRows: RagSearchResult[], limit: number) {
    const results = new Map<string, RagSearchResult>();
    const addRows = (rows: RagSearchResult[]) => rows.forEach((row, index) => {
      const rrfScore = 1 / (60 + index + 1);
      const existing = results.get(row.chunkId);
      results.set(row.chunkId, { ...(existing ?? row), score: (existing?.score ?? 0) + rrfScore });
    });
    addRows(vectorRows);
    addRows(lexicalRows);
    return this.diversifyResults([...results.values()].sort((a, b) => b.score - a.score), limit);
  }

  private diversifyResults(results: RagSearchResult[], limit: number) {
    const selected: RagSearchResult[] = [];
    const selectedDocuments = new Set<string>();

    for (const result of results) {
      if (selectedDocuments.has(result.documentId)) continue;
      selected.push(result);
      selectedDocuments.add(result.documentId);
      if (selected.length === limit) return selected;
    }

    for (const result of results) {
      if (selected.some((item) => item.chunkId === result.chunkId)) continue;
      selected.push(result);
      if (selected.length === limit) break;
    }

    return selected;
  }

  private rerankResults(question: string, results: RagSearchResult[]) {
    const terms = this.queryTerms(question);
    if (!terms.size) return results;

    return results
      .map((result) => {
        const titleHits = this.matchRatio(result.title, terms);
        const contentHits = this.matchRatio(result.chunkText, terms);
        const rerankScore = titleHits * 0.6 + contentHits * 0.4;
        return { ...result, rerankScore };
      })
      .sort((a, b) => (b.rerankScore ?? 0) - (a.rerankScore ?? 0) || b.score - a.score);
  }

  private hasSufficientEvidence(results: RagSearchResult[]) {
    return results.length > 0 && (results[0]?.score ?? 0) >= 1 / 61;
  }

  private async hasCompatibleActiveIndex(metadata: ReturnType<EmbeddingService['getMetadata']>) {
    return (await this.documents.count({
      where: {
        indexStatus: 'ACTIVE',
        embeddingModel: metadata.model,
        embeddingMode: metadata.mode,
        embeddingVersion: metadata.version,
        embeddingDimension: metadata.dimension,
      },
    })) > 0;
  }

  private queryTerms(question: string) {
    return new Set(
      question
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .split(/\s+/)
        .filter(Boolean),
    );
  }

  private matchRatio(text: string, terms: Set<string>) {
    const normalized = text.toLowerCase();
    return [...terms].filter((term) => normalized.includes(term)).length / terms.size;
  }

  private completeSearch(response: RagSearchResponse, startedAt: number) {
    this.metrics.recordSearch(response.status, Date.now() - startedAt);
    return response;
  }

  private toReindexTarget(document: KnowledgeDocument): RagReindexTarget {
    return {
      id: document.id,
      title: document.title,
      category: document.category,
      indexStatus: document.indexStatus,
      embeddingModel: document.embeddingModel,
      embeddingMode: document.embeddingMode,
      embeddingVersion: document.embeddingVersion,
      embeddingDimension: document.embeddingDimension,
      updatedAt: document.updatedAt,
    };
  }

  private reindexTargetQuery() {
    const expectedEmbedding = this.embeddings.getMetadata();
    return this.documents
      .createQueryBuilder('document')
      .where(
        new Brackets((query) => {
          query
            .where('document."indexStatus" != :active', { active: 'ACTIVE' })
            .orWhere('document."embeddingModel" IS NULL')
            .orWhere('document."embeddingMode" IS NULL')
            .orWhere('document."embeddingVersion" IS NULL')
            .orWhere('document."embeddingDimension" IS NULL')
            .orWhere('document."embeddingModel" != :model', { model: expectedEmbedding.model })
            .orWhere('document."embeddingMode" != :mode', { mode: expectedEmbedding.mode })
            .orWhere('document."embeddingVersion" != :version', { version: expectedEmbedding.version })
            .orWhere('document."embeddingDimension" != :dimension', { dimension: expectedEmbedding.dimension });
        }),
      )
      .orderBy('document.updatedAt', 'DESC');
  }

  splitText(content: string): Array<{ chunkText: string; sectionPath?: string; sourceStart: number; sourceEnd: number }> {
    const normalized = content.replace(/\r\n/g, '\n').trim();
    if (!normalized) return [];

    const chunks: Array<{ chunkText: string; sectionPath?: string; sourceStart: number; sourceEnd: number }> = [];
    const headingStarts = [...normalized.matchAll(/^#{1,6}\s+.+$/gm)].map((heading) => heading.index ?? 0);
    const boundaries = [...new Set([0, ...headingStarts, normalized.length])].sort((a, b) => a - b);

    for (let boundary = 0; boundary < boundaries.length - 1; boundary += 1) {
      const rangeStart = boundaries[boundary];
      const rangeEnd = boundaries[boundary + 1];
      let start = rangeStart;
      while (start < rangeEnd) {
        const hardEnd = Math.min(start + this.chunkSize, rangeEnd);
        const slice = normalized.slice(start, hardEnd);
        const paragraphBreak = slice.lastIndexOf('\n\n');
        const sentenceBreak = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('! '), slice.lastIndexOf('? '));
        const candidate =
          paragraphBreak > this.chunkSize * 0.45
            ? paragraphBreak
            : sentenceBreak > this.chunkSize * 0.45
              ? sentenceBreak + 1
              : slice.length;
        const softEnd = hardEnd === rangeEnd ? hardEnd : start + candidate;
        const chunkText = normalized.slice(start, softEnd).trim();
        if (chunkText) chunks.push({ chunkText, sectionPath: this.sectionPathAt(normalized, start), sourceStart: start, sourceEnd: softEnd });
        if (softEnd >= rangeEnd) break;
        start = Math.max(softEnd - this.chunkOverlap, start + 1);
      }
    }

    const seen = new Set<string>();
    return chunks.filter((chunk) => {
      const key = chunk.chunkText.replace(/\s+/g, ' ').trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private sectionPathAt(content: string, position: number) {
    const headings = [...content.matchAll(/^(#{1,6})\s+(.+)$/gm)].filter((heading) => (heading.index ?? 0) <= position);
    if (!headings.length) return undefined;
    const path: string[] = [];
    for (const heading of headings) {
      const level = heading[1].length;
      path.splice(level - 1);
      path[level - 1] = heading[2].trim();
    }
    return path.filter(Boolean).join(' > ');
  }
}
