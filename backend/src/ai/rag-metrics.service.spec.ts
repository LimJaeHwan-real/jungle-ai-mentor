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
      embedding: { total: 0, succeeded: 0, failed: 0, retries: 0, totalDurationMs: 0, p95DurationMs: null, recentDurationCount: 0, provider: null, model: null, mode: null, dimension: null },
    });
  });

  it('임베딩 요청·실패·재시도와 비밀값 없는 모델 메타데이터를 집계한다', () => {
    const metrics = new RagMetricsService();
    const before = metrics.getSnapshot().embedding;
    const metadata = { provider: 'openai', model: 'text-embedding-3-small', mode: 'real', dimension: 1536 };
    metrics.recordEmbeddingRequest(metadata);
    metrics.recordEmbeddingRetry();
    metrics.recordEmbeddingResult(true, 20);
    metrics.recordEmbeddingRequest(metadata);
    metrics.recordEmbeddingResult(false, 30);

    const after = metrics.getSnapshot().embedding;
    expect(after.total - before.total).toBe(2);
    expect(after.succeeded - before.succeeded).toBe(1);
    expect(after.failed - before.failed).toBe(1);
    expect(after.retries - before.retries).toBe(1);
    expect(after.totalDurationMs - before.totalDurationMs).toBe(50);
    expect(after).toMatchObject({ provider: 'openai', model: 'text-embedding-3-small', mode: 'real', dimension: 1536 });
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
