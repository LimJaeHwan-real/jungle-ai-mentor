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
  indexing: {
    created: number;
    updated: number;
    skipped: number;
    failed: number;
  };
}

@Injectable()
export class RagMetricsService {
  private static readonly durationWindow: number[] = [];
  private static readonly durationWindowLimit = 200;
  private static snapshot: RagMetricsSnapshot = {
    searches: { total: 0, sufficientEvidence: 0, insufficientEvidence: 0, degraded: 0, noActiveIndex: 0, totalDurationMs: 0, p95DurationMs: null, recentDurationCount: 0 },
    indexing: { created: 0, updated: 0, skipped: 0, failed: 0 },
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

  getSnapshot(): RagMetricsSnapshot {
    return structuredClone(RagMetricsService.snapshot);
  }
}
