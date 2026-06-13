import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { Repository } from 'typeorm';
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
  score: number;
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

    const document = existing ?? this.documents.create();
    Object.assign(document, {
        title: dto.title,
        content: dto.content,
        category: dto.category ?? 'GENERAL',
        sourceType: dto.sourceType ?? 'ADMIN',
        sourceUrl: dto.sourceUrl,
        contentHash,
    });

    const savedDocument = await this.documents.save(document);

    if (existing) {
      await this.chunks.delete({ documentId: savedDocument.id });
    }

    const texts = this.splitText(dto.content);
    const chunks = await Promise.all(
      texts.map(async (chunkText, index) =>
        this.chunks.create({
          documentId: savedDocument.id,
          chunkIndex: index,
          chunkText,
          tokenCount: Math.ceil(chunkText.length / 4),
          embedding: await this.embeddings.embed(chunkText),
        }),
      ),
    );
    await this.chunks.save(chunks);

    return {
      id: savedDocument.id,
      title: savedDocument.title,
      category: savedDocument.category,
      chunkCount: chunks.length,
      contentHash,
      status: existing ? 'updated' : 'created',
    };
  }

  async search(question: string, limit = 4): Promise<RagSearchResult[]> {
    const embedding = await this.embeddings.embed(question);
    const vector = this.embeddings.toSqlVector(embedding);

    try {
      const rows = await this.chunks.query(
        `
        SELECT
          c.id AS "chunkId",
          c."documentId" AS "documentId",
          d.title AS title,
          d.category AS category,
          d."sourceUrl" AS "sourceUrl",
          c."chunkText" AS "chunkText",
          1 - (c.embedding <=> $1::vector) AS score
        FROM document_chunks c
        INNER JOIN documents d ON d.id = c."documentId"
        WHERE c.embedding IS NOT NULL
        ORDER BY c.embedding <=> $1::vector
        LIMIT $2
        `,
        [vector, limit],
      );
      return rows;
    } catch {
      return this.lexicalFallback(question, limit);
    }
  }

  private async lexicalFallback(question: string, limit: number): Promise<RagSearchResult[]> {
    const chunks = await this.chunks.find({
      relations: { document: true },
      order: { createdAt: 'DESC' },
      take: 100,
    });
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
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  private splitText(content: string) {
    const normalized = content.replace(/\r\n/g, '\n').trim();
    if (!normalized) return [];

    const chunks: string[] = [];
    let start = 0;

    while (start < normalized.length) {
      const hardEnd = Math.min(start + this.chunkSize, normalized.length);
      const slice = normalized.slice(start, hardEnd);
      const paragraphBreak = slice.lastIndexOf('\n\n');
      const sentenceBreak = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('! '), slice.lastIndexOf('? '));
      const candidate =
        paragraphBreak > this.chunkSize * 0.45
          ? paragraphBreak
          : sentenceBreak > this.chunkSize * 0.45
            ? sentenceBreak + 1
            : slice.length;
      const softEnd = hardEnd === normalized.length ? hardEnd : start + candidate;

      chunks.push(normalized.slice(start, softEnd).trim());
      if (softEnd >= normalized.length) break;
      start = Math.max(softEnd - this.chunkOverlap, start + 1);
    }

    return chunks.filter(Boolean);
  }
}
