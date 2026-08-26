import { BadRequestException, Injectable, NotFoundException, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource, Repository } from 'typeorm';
import { EmbeddingService } from './embedding.service';
import { RagReindexJob, RagReindexJobStatus } from './entities/rag-reindex-job.entity';
import { RagReindexJobItem, RagReindexJobItemStatus } from './entities/rag-reindex-job-item.entity';
import { RagService } from './rag.service';

interface ClaimedItem {
  id: string;
  jobId: string;
  documentId: string;
}

@Injectable()
export class RagReindexService implements OnModuleInit {
  private readonly leaseMinutes = 30;
  private draining = false;

  constructor(
    @InjectRepository(RagReindexJob) private readonly jobs: Repository<RagReindexJob>,
    @InjectRepository(RagReindexJobItem) private readonly items: Repository<RagReindexJobItem>,
    private readonly dataSource: DataSource,
    private readonly rag: RagService,
    private readonly embeddings: EmbeddingService,
  ) {}

  async onModuleInit() {
    await this.recoverExpiredItems();
    this.requestDrain();
  }

  async createJob(documentIds?: string[]) {
    const uniqueIds = documentIds ? [...new Set(documentIds)] : undefined;
    const targets = await this.rag.findReindexTargetDocuments(uniqueIds);
    if (uniqueIds && targets.length !== uniqueIds.length) {
      throw new BadRequestException('요청 문서에는 현재 재색인이 필요하지 않거나 찾을 수 없는 항목이 포함되어 있습니다.');
    }

    const metadata = this.embeddings.getMetadata();
    const job = await this.dataSource.transaction(async (manager) => {
      const savedJob = await manager.save(
        RagReindexJob,
        manager.create(RagReindexJob, {
          embeddingModel: metadata.model,
          embeddingMode: metadata.mode,
          embeddingVersion: metadata.version,
          embeddingDimension: metadata.dimension,
        }),
      );
      let queuedCount = 0;
      for (const target of targets) {
        const inserted = (await manager.query(
          `INSERT INTO rag_reindex_job_items (id, "jobId", "documentId", status, "createdAt", "updatedAt")
           VALUES ($1, $2, $3, 'PENDING', NOW(), NOW())
           ON CONFLICT ("documentId") WHERE status IN ('PENDING', 'RUNNING') DO NOTHING
           RETURNING id`,
          [randomUUID(), savedJob.id, target.id],
        )) as Array<{ id: string }>;
        if (inserted.length) queuedCount += 1;
      }
      savedJob.targetCount = queuedCount;
      savedJob.duplicateCount = targets.length - queuedCount;
      if (!queuedCount) {
        savedJob.status = 'COMPLETED';
        savedJob.finishedAt = new Date();
      }
      return manager.save(RagReindexJob, savedJob);
    });

    if (job.targetCount) this.requestDrain();
    return this.getJob(job.id);
  }

  async getJob(jobId: string) {
    const job = await this.jobs.findOne({ where: { id: jobId } });
    if (!job) throw new NotFoundException('재색인 작업을 찾을 수 없습니다.');
    const items = await this.items.find({ where: { jobId }, order: { createdAt: 'ASC' } });
    return {
      id: job.id,
      status: job.status,
      targetCount: job.targetCount,
      successCount: job.successCount,
      failureCount: job.failureCount,
      duplicateCount: job.duplicateCount,
      embedding: {
        model: job.embeddingModel,
        mode: job.embeddingMode,
        version: job.embeddingVersion,
        dimension: job.embeddingDimension,
      },
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      createdAt: job.createdAt,
      items: items.map((item) => ({
        documentId: item.documentId,
        status: item.status,
        errorCode: item.errorCode,
        errorMessage: item.errorMessage,
        startedAt: item.startedAt,
        finishedAt: item.finishedAt,
      })),
    };
  }

  private requestDrain() {
    void this.drain().catch(() => undefined);
  }

  private async drain() {
    if (this.draining) return;
    this.draining = true;
    try {
      let item: ClaimedItem | undefined;
      while ((item = await this.claimNextItem())) await this.processItem(item);
    } finally {
      this.draining = false;
    }
  }

  private async claimNextItem(): Promise<ClaimedItem | undefined> {
    return this.dataSource.transaction(async (manager) => {
      const rows = (await manager.query(
        `WITH candidate AS (
           SELECT id
           FROM rag_reindex_job_items
           WHERE status = 'PENDING'
           ORDER BY "createdAt" ASC
           LIMIT 1
           FOR UPDATE SKIP LOCKED
         )
         UPDATE rag_reindex_job_items item
         SET status = 'RUNNING', "startedAt" = NOW(), "leaseUntil" = NOW() + INTERVAL '${this.leaseMinutes} minutes', "updatedAt" = NOW()
         FROM candidate
         WHERE item.id = candidate.id
         RETURNING item.id, item."jobId" AS "jobId", item."documentId" AS "documentId"`,
      )) as ClaimedItem[];
      const item = rows[0];
      if (!item) return undefined;
      await manager.query(
        `UPDATE rag_reindex_jobs
         SET status = 'RUNNING', "startedAt" = COALESCE("startedAt", NOW()), "updatedAt" = NOW()
         WHERE id = $1 AND status = 'QUEUED'`,
        [item.jobId],
      );
      return item;
    });
  }

  private async processItem(item: ClaimedItem) {
    let timer: NodeJS.Timeout | undefined;
    try {
      timer = setInterval(() => {
        void this.dataSource.query(
          `UPDATE rag_reindex_job_items SET "leaseUntil" = NOW() + INTERVAL '${this.leaseMinutes} minutes', "updatedAt" = NOW() WHERE id = $1 AND status = 'RUNNING'`,
          [item.id],
        );
      }, 60_000);
      await this.rag.reindexDocument(item.documentId);
      await this.completeItem(item, 'SUCCEEDED');
    } catch (error) {
      const failure = this.safeFailure(error);
      await this.completeItem(item, 'FAILED', failure.code, failure.message);
    } finally {
      if (timer) clearInterval(timer);
    }
  }

  private async completeItem(item: ClaimedItem, status: RagReindexJobItemStatus, errorCode?: string, errorMessage?: string) {
    await this.dataSource.transaction(async (manager) => {
      await manager.update(RagReindexJobItem, item.id, {
        status,
        errorCode: errorCode ?? null,
        errorMessage: errorMessage ?? null,
        finishedAt: new Date(),
        leaseUntil: null,
      });
      await this.refreshJobSummary(manager, item.jobId);
    });
  }

  private async refreshJobSummary(manager: import('typeorm').EntityManager, jobId: string) {
    const rows = (await manager.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'SUCCEEDED')::int AS "successCount",
         COUNT(*) FILTER (WHERE status = 'FAILED')::int AS "failureCount",
         COUNT(*) FILTER (WHERE status IN ('PENDING', 'RUNNING'))::int AS "remainingCount"
       FROM rag_reindex_job_items
       WHERE "jobId" = $1`,
      [jobId],
    )) as Array<{ successCount: number; failureCount: number; remainingCount: number }>;
    const counts = rows[0] ?? { successCount: 0, failureCount: 0, remainingCount: 0 };
    const completed = Number(counts.remainingCount) === 0;
    const status: RagReindexJobStatus = completed
      ? Number(counts.failureCount) > 0
        ? 'COMPLETED_WITH_FAILURES'
        : 'COMPLETED'
      : 'RUNNING';
    await manager.update(RagReindexJob, jobId, {
      status,
      successCount: Number(counts.successCount),
      failureCount: Number(counts.failureCount),
      finishedAt: completed ? new Date() : null,
    });
  }

  private async recoverExpiredItems() {
    await this.dataSource.query(
      `UPDATE rag_reindex_job_items
       SET status = 'PENDING', "startedAt" = NULL, "leaseUntil" = NULL, "updatedAt" = NOW()
       WHERE status = 'RUNNING' AND ("leaseUntil" IS NULL OR "leaseUntil" < NOW())`,
    );
  }

  private safeFailure(error: unknown) {
    if (error instanceof NotFoundException) {
      return { code: 'DOCUMENT_NOT_FOUND', message: '재색인 대상 문서를 찾을 수 없습니다.' };
    }
    if (error instanceof BadRequestException) {
      return { code: 'INVALID_DOCUMENT_CONTENT', message: '문서 내용이 비어 있거나 색인할 수 없습니다.' };
    }
    if (error instanceof ServiceUnavailableException) {
      return { code: 'EMBEDDING_UNAVAILABLE', message: '임베딩 서비스를 사용할 수 없어 기존 색인을 유지했습니다.' };
    }
    return { code: 'INDEX_WRITE_FAILED', message: '재색인 저장에 실패하여 기존 색인을 유지했습니다.' };
  }
}
