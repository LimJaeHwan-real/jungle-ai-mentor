import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { DataSource, Repository } from 'typeorm';
import { CreateDocumentDto } from './dto/create-document.dto';
import { DocumentChunk } from './entities/document-chunk.entity';
import { KnowledgeDocument } from './entities/knowledge-document.entity';
import { EmbeddingService } from './embedding.service';

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
}

export type RagRetrievalStatus = 'SUFFICIENT_EVIDENCE' | 'INSUFFICIENT_EVIDENCE' | 'SEARCH_DEGRADED';

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

@Injectable()
export class RagService {
  private readonly chunkSize = 700;
  private readonly chunkOverlap = 120;

  constructor(
    @InjectRepository(KnowledgeDocument) private readonly documents: Repository<KnowledgeDocument>,
    @InjectRepository(DocumentChunk) private readonly chunks: Repository<DocumentChunk>,
    private readonly embeddings: EmbeddingService,
    private readonly dataSource: DataSource,
  ) {}

  async createDocument(dto: CreateDocumentDto) {
    return this.indexDocument(dto);
  }

  async indexDocument(dto: CreateDocumentDto): Promise<RagIndexResult> {
    const contentHash = createHash('sha256').update(dto.content).digest('hex');
    const existing = dto.sourceUrl ? await this.documents.findOne({ where: { sourceUrl: dto.sourceUrl } }) : undefined;

    if (existing?.contentHash === contentHash) {
      const chunkCount = await this.chunks.count({ where: { documentId: existing.id } });
      return {
        id: existing.id,
        title: existing.title,
        category: existing.category,
        chunkCount,
        contentHash,
        status: 'skipped',
      };
    }

    const texts = this.splitText(dto.content);
    let vectors: number[][];
    try {
      vectors = await Promise.all(texts.map((chunk) => this.embeddings.embed(chunk.chunkText)));
    } catch (error) {
      if (!existing) await this.documents.save(this.documents.create({ title: dto.title, content: dto.content, category: dto.category ?? 'GENERAL', sourceType: dto.sourceType ?? 'ADMIN', sourceUrl: dto.sourceUrl, contentHash, indexStatus: 'FAILED' }));
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

    return {
      id: savedDocument.id,
      title: savedDocument.title,
      category: savedDocument.category,
      chunkCount: texts.length,
      contentHash,
      status: existing ? 'updated' : 'created',
    };
  }

  async search(question: string, limit = 4): Promise<RagSearchResult[]> {
    return (await this.searchWithStatus(question, limit)).results;
  }

  async searchWithStatus(question: string, limit = 4): Promise<RagSearchResponse> {
    const embedding = await this.embeddings.embed(question);
    const vector = this.embeddings.toSqlVector(embedding);
    const metadata = this.embeddings.getMetadata();

    try {
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
      const results = this.mergeSearchResults(rows, lexicalRows, limit);
      return { results, status: this.hasSufficientEvidence(results) ? 'SUFFICIENT_EVIDENCE' : 'INSUFFICIENT_EVIDENCE' };
    } catch {
      try {
        return { results: await this.lexicalSearch(question, limit), status: 'SEARCH_DEGRADED' };
      } catch {
        return { results: [], status: 'SEARCH_DEGRADED' };
      }
    }
  }

  private async lexicalSearch(question: string, limit: number, category?: string): Promise<RagSearchResult[]> {
    const qb = this.chunks
      .createQueryBuilder('chunk')
      .leftJoinAndSelect('chunk.document', 'document')
      .orderBy('chunk.createdAt', 'DESC')
      .take(150);
    if (category) {
      qb.andWhere('document.category = :category', { category });
    }
    const chunks = await qb.getMany();
    const terms = new Set(
      question
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .split(/\s+/)
        .filter(Boolean),
    );

    return chunks
      .map((chunk) => {
        const haystack = `${chunk.chunkText} ${chunk.document?.title ?? ''}`.toLowerCase();
        const hits = [...terms].filter((term) => haystack.includes(term)).length;
        return {
          chunkId: chunk.id,
          documentId: chunk.documentId,
          title: chunk.document?.title ?? '문서',
          category: chunk.document?.category ?? 'GENERAL',
          sourceUrl: chunk.document?.sourceUrl,
          chunkText: chunk.chunkText,
          score: hits / Math.max(terms.size, 1),
        };
      })
      .filter((result) => result.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
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
    return [...results.values()].sort((a, b) => b.score - a.score).slice(0, limit);
  }

  private hasSufficientEvidence(results: RagSearchResult[]) {
    return results.length > 0 && (results[0]?.score ?? 0) >= 1 / 61;
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
