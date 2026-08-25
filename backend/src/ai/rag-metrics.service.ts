import { Injectable } from '@nestjs/common';
import type { RagRetrievalStatus } from './rag.service';

export interface RagMetricsSnapshot {
  searches: {
    total: number;
    sufficientEvidence: number;
    insufficientEvidence: number;
    degraded: number;
    totalDurationMs: number;
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
  private static snapshot: RagMetricsSnapshot = {
    searches: { total: 0, sufficientEvidence: 0, insufficientEvidence: 0, degraded: 0, totalDurationMs: 0 },
    indexing: { created: 0, updated: 0, skipped: 0, failed: 0 },
  };

  recordSearch(status: RagRetrievalStatus, durationMs: number) {
    const searches = RagMetricsService.snapshot.searches;
    searches.total += 1;
    searches.totalDurationMs += durationMs;
    if (status === 'SUFFICIENT_EVIDENCE') searches.sufficientEvidence += 1;
    if (status === 'INSUFFICIENT_EVIDENCE') searches.insufficientEvidence += 1;
    if (status === 'SEARCH_DEGRADED') searches.degraded += 1;
  }

  recordIndex(status: 'created' | 'updated' | 'skipped' | 'failed') {
    RagMetricsService.snapshot.indexing[status] += 1;
  }

  getSnapshot(): RagMetricsSnapshot {
    return structuredClone(RagMetricsService.snapshot);
  }
}
