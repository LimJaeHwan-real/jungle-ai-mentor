import { RagMetricsService } from './rag-metrics.service';

describe('RagMetricsService', () => {
  it('검색 상태와 색인 결과를 집계한다', () => {
    const metrics = new RagMetricsService();
    metrics.recordSearch('SUFFICIENT_EVIDENCE', 12);
    metrics.recordSearch('SEARCH_DEGRADED', 8);
    metrics.recordSearch('NO_ACTIVE_INDEX', 5);
    metrics.recordIndex('created');
    metrics.recordIndex('failed');

    expect(metrics.getSnapshot()).toEqual({
      searches: { total: 3, sufficientEvidence: 1, insufficientEvidence: 0, degraded: 1, noActiveIndex: 1, totalDurationMs: 25, p95DurationMs: 12, recentDurationCount: 3 },
      indexing: { created: 1, updated: 0, skipped: 0, failed: 1 },
    });
  });

  it('최근 검색 200건만 유지해 p95를 계산한다', () => {
    const metrics = new RagMetricsService();
    for (let duration = 1; duration <= 201; duration += 1) metrics.recordSearch('SUFFICIENT_EVIDENCE', duration);

    const searches = metrics.getSnapshot().searches;
    expect(searches.recentDurationCount).toBe(200);
    expect(searches.p95DurationMs).toBe(191);
  });

  it('반환한 스냅샷을 수정해도 내부 집계값은 보존한다', () => {
    const metrics = new RagMetricsService();
    const snapshot = metrics.getSnapshot();
    snapshot.searches.total = 999;

    expect(metrics.getSnapshot().searches.total).not.toBe(999);
  });
});
