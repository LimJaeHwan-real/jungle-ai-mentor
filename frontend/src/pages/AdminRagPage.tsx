import { FormEvent, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { api, getErrorMessage } from '../api';

interface RagMetrics {
  searches: {
    total: number;
    sufficientEvidence: number;
    insufficientEvidence: number;
    degraded: number;
    noActiveIndex: number;
    p95DurationMs: number | null;
    recentDurationCount: number;
  };
  retrieval?: {
    fusionRuns: number;
    rerankRuns: number;
    vectorCandidates: number;
    lexicalCandidates: number;
    selectedResults: number;
    vectorFailures: number;
    lexicalFailures: number;
  };
  indexing: { created: number; updated: number; skipped: number; failed: number };
  embedding: {
    total: number;
    succeeded: number;
    failed: number;
    retries: number;
    p95DurationMs: number | null;
    recentDurationCount: number;
    provider: string | null;
    model: string | null;
    mode: string | null;
    dimension: number | null;
  };
}

interface ReindexTargets {
  count: number;
  documents: Array<{
    id: string;
    title: string;
    category: string;
    indexStatus: string;
    embeddingModel?: string;
    embeddingMode?: string;
    chunkingVersion?: string;
  }>;
}

interface ReindexJob {
  id: string;
  status: string;
  targetCount: number;
  successCount: number;
  failureCount: number;
  duplicateCount: number;
  items: Array<{ documentId: string; status: string; errorCode?: string }>;
}

export function AdminRagPage() {
  const [jobIdInput, setJobIdInput] = useState('');
  const [selectedJobId, setSelectedJobId] = useState('');
  const metrics = useQuery({
    queryKey: ['admin', 'rag', 'metrics'],
    queryFn: async () => (await api.get<RagMetrics>('/admin/rag/metrics')).data,
    refetchInterval: 30_000,
  });
  const targets = useQuery({
    queryKey: ['admin', 'rag', 'reindex-targets'],
    queryFn: async () => (await api.get<ReindexTargets>('/admin/rag/reindex-targets')).data,
  });
  const job = useQuery({
    queryKey: ['admin', 'rag', 'reindex-job', selectedJobId],
    queryFn: async () => (await api.get<ReindexJob>(`/admin/rag/reindex-jobs/${encodeURIComponent(selectedJobId)}`)).data,
    enabled: Boolean(selectedJobId),
    refetchInterval: selectedJobId ? 30_000 : false,
  });

  function findJob(event: FormEvent) {
    event.preventDefault();
    setSelectedJobId(jobIdInput.trim());
  }

  return (
    <div className="page-grid">
      <section className="section-block">
        <div className="section-heading">
          <h2>RAG 운영 현황</h2>
          <button className="secondary-button" type="button" onClick={() => { void metrics.refetch(); void targets.refetch(); }}>
            <RefreshCw size={17} /> 새로고침
          </button>
        </div>
        <p className="muted-line">검색·색인 수치는 현재 서버 프로세스가 시작된 뒤의 누적값입니다. 서버가 재시작되면 초기화됩니다.</p>
        {metrics.isPending && <p className="loading">지표를 불러오는 중입니다.</p>}
        {metrics.error && <p className="error-text">{getErrorMessage(metrics.error)}</p>}
        {metrics.data && (
          <>
            <div className="faq-grid">
              <article className="faq-card"><span>검색 요청</span><strong>{metrics.data.searches.total}건</strong></article>
              <article className="faq-card"><span>근거 충분 / 부족</span><strong>{metrics.data.searches.sufficientEvidence} / {metrics.data.searches.insufficientEvidence}건</strong></article>
              <article className="faq-card"><span>검색 장애 / 활성 색인 없음</span><strong>{metrics.data.searches.degraded} / {metrics.data.searches.noActiveIndex}건</strong></article>
              <article className="faq-card"><span>최근 {metrics.data.searches.recentDurationCount}건 검색 지연 p95</span><strong>{metrics.data.searches.p95DurationMs === null ? '측정 전' : `${metrics.data.searches.p95DurationMs}ms`}</strong></article>
              <article className="faq-card"><span>색인 생성 / 갱신</span><strong>{metrics.data.indexing.created} / {metrics.data.indexing.updated}건</strong></article>
              <article className="faq-card"><span>색인 실패 / 건너뜀</span><strong>{metrics.data.indexing.failed} / {metrics.data.indexing.skipped}건</strong></article>
            </div>
            {metrics.data.retrieval && <>
              <h3>검색 경로</h3>
              <div className="faq-grid">
                <article className="faq-card"><span>벡터 / 키워드 후보 누적</span><strong>{metrics.data.retrieval.vectorCandidates} / {metrics.data.retrieval.lexicalCandidates}건</strong></article>
                <article className="faq-card"><span>결합 / 재정렬 실행</span><strong>{metrics.data.retrieval.fusionRuns} / {metrics.data.retrieval.rerankRuns}회</strong></article>
                <article className="faq-card"><span>최종 선택 결과 누적</span><strong>{metrics.data.retrieval.selectedResults}건</strong></article>
                <article className="faq-card"><span>벡터 / 키워드 조회 실패</span><strong>{metrics.data.retrieval.vectorFailures} / {metrics.data.retrieval.lexicalFailures}회</strong></article>
              </div>
            </>}
            <h3>임베딩 서비스</h3>
            <p className="muted-line">{metrics.data.embedding.provider ?? '제공자 미확인'} / {metrics.data.embedding.model ?? '모델 미확인'} / {metrics.data.embedding.mode ?? '모드 미확인'} / {metrics.data.embedding.dimension === null ? '차원 미확인' : `${metrics.data.embedding.dimension}차원`}</p>
            <div className="faq-grid">
              <article className="faq-card"><span>요청 / 성공 / 실패</span><strong>{metrics.data.embedding.total} / {metrics.data.embedding.succeeded} / {metrics.data.embedding.failed}건</strong></article>
              <article className="faq-card"><span>재시도</span><strong>{metrics.data.embedding.retries}회</strong></article>
              <article className="faq-card"><span>최근 {metrics.data.embedding.recentDurationCount}건 임베딩 지연 p95</span><strong>{metrics.data.embedding.p95DurationMs === null ? '측정 전' : `${metrics.data.embedding.p95DurationMs}ms`}</strong></article>
            </div>
          </>
        )}
      </section>

      <section className="section-block">
        <h2>재색인 대상</h2>
        <p className="muted-line">현재 설정과 맞지 않거나 비활성 상태인 문서입니다. 최대 100건을 표시하며, 이 화면에서 재색인을 시작하지 않습니다.</p>
        {targets.isPending && <p className="loading">대상 문서를 불러오는 중입니다.</p>}
        {targets.error && <p className="error-text">{getErrorMessage(targets.error)}</p>}
        {targets.data && <p>표시된 대상: <strong>{targets.data.count}건</strong></p>}
        {targets.data?.documents.length === 0 && <p className="muted-line">현재 표시할 재색인 대상이 없습니다.</p>}
        <div className="reference-list">
          {targets.data?.documents.map((document) => (
            <article className="reference-card" key={document.id}>
              <strong>{document.title}</strong>
              <small>{document.category} · {document.indexStatus} · {document.id}</small>
              <small>임베딩: {document.embeddingModel ?? '기록 없음'} / {document.embeddingMode ?? '기록 없음'}</small>
              <small>분할 버전: {document.chunkingVersion ?? '기록 없음'}</small>
            </article>
          ))}
        </div>
      </section>

      <section className="section-block">
        <h2>재색인 작업 조회</h2>
        <form className="stack-form" onSubmit={findJob}>
          <label>작업 ID
            <input value={jobIdInput} onChange={(event) => setJobIdInput(event.target.value)} required placeholder="재색인 작업 ID를 입력하세요" />
          </label>
          <button className="secondary-button" type="submit">상태 조회</button>
        </form>
        {job.isPending && selectedJobId && <p className="loading">작업 상태를 불러오는 중입니다.</p>}
        {job.error && <p className="error-text">{getErrorMessage(job.error)}</p>}
        {job.data && (
          <div className="reference-section">
            <p><strong>{job.data.status}</strong> · 대상 {job.data.targetCount}건 · 성공 {job.data.successCount}건 · 실패 {job.data.failureCount}건 · 중복 {job.data.duplicateCount}건</p>
            <div className="reference-list">
              {job.data.items.map((item) => (
                <article className="reference-card" key={item.documentId}>
                  <strong>{item.documentId}</strong>
                  <small>{item.status}{item.errorCode ? ` · ${item.errorCode}` : ''}</small>
                </article>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
