import { Injectable } from '@nestjs/common';
import type { RagRetrievalStatus } from './rag.service';

export interface RagMetricsSnapshot {
  searches: {
    total: number;
    sufficientEvidence: number;
    insufficientEvidence: number;
    degraded: number;
    noActiveIndex: number;
    totalDurationMs: number;
    p95DurationMs: number | null;
    recentDurationCount: number;
  };
  retrieval: {
    fusionRuns: number;
    rerankRuns: number;
    vectorCandidates: number;
    lexicalCandidates: number;
    selectedResults: number;
    vectorFailures: number;
    lexicalFailures: number;
  };
  indexing: {
    created: number;
    updated: number;
    skipped: number;
    failed: number;
  };
  embedding: {
    total: number;
    succeeded: number;
    failed: number;
    retries: number;
    totalDurationMs: number;
    p95DurationMs: number | null;
    recentDurationCount: number;
    provider: string | null;
    model: string | null;
    mode: string | null;
    dimension: number | null;
  };
}

@Injectable()
export class RagMetricsService {
  private static readonly durationWindow: number[] = [];
  private static readonly embeddingDurationWindow: number[] = [];
  private static readonly durationWindowLimit = 200;
  private static snapshot: RagMetricsSnapshot = {
    searches: { total: 0, sufficientEvidence: 0, insufficientEvidence: 0, degraded: 0, noActiveIndex: 0, totalDurationMs: 0, p95DurationMs: null, recentDurationCount: 0 },
    retrieval: { fusionRuns: 0, rerankRuns: 0, vectorCandidates: 0, lexicalCandidates: 0, selectedResults: 0, vectorFailures: 0, lexicalFailures: 0 },
    indexing: { created: 0, updated: 0, skipped: 0, failed: 0 },
    embedding: { total: 0, succeeded: 0, failed: 0, retries: 0, totalDurationMs: 0, p95DurationMs: null, recentDurationCount: 0, provider: null, model: null, mode: null, dimension: null },
  };

  recordSearch(status: RagRetrievalStatus, durationMs: number) {
    const searches = RagMetricsService.snapshot.searches;
    searches.total += 1;
    searches.totalDurationMs += durationMs;
    RagMetricsService.durationWindow.push(durationMs);
    if (RagMetricsService.durationWindow.length > RagMetricsService.durationWindowLimit) RagMetricsService.durationWindow.shift();
    const sorted = [...RagMetricsService.durationWindow].sort((a, b) => a - b);
    searches.recentDurationCount = sorted.length;
    searches.p95DurationMs = sorted[Math.ceil(0.95 * sorted.length) - 1];
    if (status === 'SUFFICIENT_EVIDENCE') searches.sufficientEvidence += 1;
    if (status === 'INSUFFICIENT_EVIDENCE') searches.insufficientEvidence += 1;
    if (status === 'SEARCH_DEGRADED') searches.degraded += 1;
    if (status === 'NO_ACTIVE_INDEX') searches.noActiveIndex += 1;
  }

  recordIndex(status: 'created' | 'updated' | 'skipped' | 'failed') {
    RagMetricsService.snapshot.indexing[status] += 1;
  }

  recordRetrievalCandidates(vectorCandidates: number, lexicalCandidates: number, selectedResults: number) {
    const retrieval = RagMetricsService.snapshot.retrieval;
    retrieval.fusionRuns += 1;
    retrieval.rerankRuns += 1;
    retrieval.vectorCandidates += vectorCandidates;
    retrieval.lexicalCandidates += lexicalCandidates;
    retrieval.selectedResults += selectedResults;
  }

  recordRetrievalFailure(path: 'vector' | 'lexical') {
    RagMetricsService.snapshot.retrieval[path === 'vector' ? 'vectorFailures' : 'lexicalFailures'] += 1;
  }

  recordEmbeddingRequest(metadata: { provider: string; model: string; mode: string; dimension: number }) {
    const embedding = RagMetricsService.snapshot.embedding;
    embedding.total += 1;
    embedding.provider = metadata.provider;
    embedding.model = metadata.model;
    embedding.mode = metadata.mode;
    embedding.dimension = metadata.dimension;
  }

  recordEmbeddingRetry() {
    RagMetricsService.snapshot.embedding.retries += 1;
  }

  recordEmbeddingResult(succeeded: boolean, durationMs: number) {
    const embedding = RagMetricsService.snapshot.embedding;
    embedding[succeeded ? 'succeeded' : 'failed'] += 1;
    embedding.totalDurationMs += durationMs;
    RagMetricsService.embeddingDurationWindow.push(durationMs);
    if (RagMetricsService.embeddingDurationWindow.length > RagMetricsService.durationWindowLimit) RagMetricsService.embeddingDurationWindow.shift();
    const sorted = [...RagMetricsService.embeddingDurationWindow].sort((a, b) => a - b);
    embedding.recentDurationCount = sorted.length;
    embedding.p95DurationMs = sorted[Math.ceil(0.95 * sorted.length) - 1];
  }

  getSnapshot(): RagMetricsSnapshot {
    return structuredClone(RagMetricsService.snapshot);
  }
}
