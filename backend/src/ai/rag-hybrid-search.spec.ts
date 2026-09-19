import { RagService, RagSearchResult } from './rag.service';

const result = (chunkId: string, score = 0, documentId = chunkId): RagSearchResult => ({ chunkId, documentId, title: chunkId, category: 'GENERAL', chunkText: chunkId, score });

describe('RagService RRF 후보 결합', () => {
  it('이미 계산된 query embedding으로 후보 검색을 수행해 임베딩을 다시 요청하지 않는다', async () => {
    const chunks = { query: jest.fn().mockResolvedValueOnce([result('vector', 0.8)]).mockResolvedValueOnce([]) };
    const embeddings = {
      embed: jest.fn(),
      toSqlVector: jest.fn(() => '[0.1,0.2]'),
      getMetadata: jest.fn(() => ({ provider: 'openai', model: 'text-embedding-3-small', mode: 'real', version: 'v1', dimension: 1536 })),
    };
    const service = Object.create(RagService.prototype) as any;
    Object.assign(service, {
      chunks,
      embeddings,
      metrics: { recordSearch: jest.fn(), recordRetrievalCandidates: jest.fn(), recordRetrievalFailure: jest.fn() },
    });

    await expect(service.searchCandidatesWithEmbedding('면접 후기', [0.1, 0.2], 4)).resolves.toMatchObject({ status: 'CANDIDATES_FOUND' });
    expect(embeddings.embed).not.toHaveBeenCalled();
    expect(embeddings.toSqlVector).toHaveBeenCalledWith([0.1, 0.2]);
  });

  it('게시글 후보가 없어도 활성 색인이 있으면 FAQ 후보를 함께 판정한다', async () => {
    const faq = { ...result('faq:faq-1'), faqId: 'faq-1', category: 'FAQ' };
    const service = Object.create(RagService.prototype) as any;
    Object.assign(service, {
      searchCandidatesWithStatus: jest.fn(async () => ({ results: [], status: 'INSUFFICIENT_EVIDENCE', startedAt: Date.now() })),
      evidenceAssessment: { assess: jest.fn(async () => ['faq:faq-1']) },
      metrics: { recordSearch: jest.fn() },
    });

    const response = await service.searchWithStatus('가상 메모리', 4, [faq]);

    expect(response).toEqual({ status: 'SUFFICIENT_EVIDENCE', results: [faq] });
    expect(service.evidenceAssessment.assess).toHaveBeenCalledWith('가상 메모리', [faq]);
  });

  it('활성 색인이 없으면 FAQ 후보로 장애를 숨기지 않는다', async () => {
    const faq = { ...result('faq:faq-1'), faqId: 'faq-1', category: 'FAQ' };
    const service = Object.create(RagService.prototype) as any;
    Object.assign(service, {
      searchCandidatesWithStatus: jest.fn(async () => ({ results: [], status: 'NO_ACTIVE_INDEX', startedAt: Date.now() })),
      evidenceAssessment: { assess: jest.fn() },
      metrics: { recordSearch: jest.fn() },
    });

    const response = await service.searchWithStatus('가상 메모리', 4, [faq]);

    expect(response).toEqual({ status: 'NO_ACTIVE_INDEX', results: [] });
    expect(service.evidenceAssessment.assess).not.toHaveBeenCalled();
  });

  it('근거 판정이 선택한 FAQ와 게시글만 답변 후보로 반환한다', async () => {
    const service = Object.create(RagService.prototype) as any;
    Object.assign(service, {
      evidenceAssessment: { assess: jest.fn(async () => ['faq:faq-1']) },
      metrics: { recordSearch: jest.fn() },
    });
    const post = result('post-1');
    const faq = { ...result('faq:faq-1'), faqId: 'faq-1', category: 'FAQ' };

    const response = await service.assessCandidates('가상 메모리', {
      results: [post, faq], status: 'CANDIDATES_FOUND', startedAt: Date.now(),
    });

    expect(response).toEqual({ status: 'SUFFICIENT_EVIDENCE', results: [faq] });
  });

  it('내부 검색 후보를 먼저 반환하고 충분성 판정을 별도로 완료한다', async () => {
    const chunks = { query: jest.fn().mockResolvedValueOnce([result('candidate', 0.5)]).mockResolvedValueOnce([]) };
    const service = Object.create(RagService.prototype) as any;
    Object.assign(service, {
      chunks,
      embeddings: { embed: jest.fn(async () => [0.1, 0.2]), toSqlVector: jest.fn(() => '[0.1,0.2]'), getMetadata: jest.fn(() => ({ provider: 'openai', model: 'text-embedding-3-small', mode: 'real', version: 'v1', dimension: 1536 })) },
      evidenceAssessment: { assess: jest.fn(async () => ['candidate']) },
      metrics: { recordSearch: jest.fn(), recordRetrievalCandidates: jest.fn(), recordRetrievalFailure: jest.fn() },
    });

    const candidates = await service.searchCandidatesWithStatus('면접 후기', 4);
    expect(candidates.status).toBe('CANDIDATES_FOUND');
    expect(service.evidenceAssessment.assess).not.toHaveBeenCalled();
    expect(service.metrics.recordSearch).not.toHaveBeenCalled();
    await expect(service.assessCandidates('면접 후기', candidates)).resolves.toMatchObject({ status: 'SUFFICIENT_EVIDENCE' });
    expect(service.evidenceAssessment.assess).toHaveBeenCalledTimes(1);
    expect(service.metrics.recordSearch).toHaveBeenCalledTimes(1);
  });

  it('PostgreSQL FTS와 GIN 인덱스로 lexical 후보를 조회한다', async () => {
    const chunks = { query: jest.fn(async (..._args: unknown[]) => [result('fts-result', 0.8)]) };
    const service = Object.create(RagService.prototype) as {
      chunks: typeof chunks;
      lexicalSearch: (question: string, limit: number, category?: string) => Promise<RagSearchResult[]>;
    };
    service.chunks = chunks;
    (service as any).embeddings = { getMetadata: () => ({ provider: 'openai', model: 'text-embedding-3-small', mode: 'real', version: 'v1', dimension: 1536 }) };

    await expect(service.lexicalSearch('지원 일정', 4)).resolves.toEqual([result('fts-result', 0.8)]);
    expect(chunks.query).toHaveBeenCalledWith(expect.stringContaining("websearch_to_tsquery('simple', $1)"), ['지원 일정', 4, null, 'openai', 'text-embedding-3-small', 'real', 'v1', 1536]);
    expect(chunks.query.mock.calls[0][0]).not.toContain('.take(150)');
    expect(chunks.query.mock.calls[0][0]).not.toContain('CREATE INDEX');
    expect(chunks.query.mock.calls[0][0]).toContain(`to_tsvector('simple', coalesce(c."chunkText", ''))`);
    expect(chunks.query.mock.calls[0][0]).toContain(`to_tsvector('simple', coalesce(d.title, ''))`);
    expect(chunks.query.mock.calls[0][0]).toContain('d."embeddingProvider" = $4');
    expect(chunks.query.mock.calls[0][0]).toContain('d."embeddingProvider" IS NULL');
    expect(chunks.query.mock.calls[0][0]).toContain('d."embeddingVersion" = $7');
    expect(chunks.query.mock.calls[0][0]).toContain('c."chunkingVersion" AS "chunkingVersion"');
    expect(chunks.query.mock.calls[0][0]).toContain('c."embeddingModel" = $5');
    expect(chunks.query.mock.calls[0][0]).toContain('c."indexStatus" = \'ACTIVE\'');
    expect(chunks.query.mock.calls[0][0]).toContain('c."embeddingProvider" IS NULL');
    const sql = chunks.query.mock.calls[0][0] as string;
    expect(sql).toContain('d."sourceType" != \'BLOG_SEARCH\'');
    expect(sql.match(/c\."embeddingModel" = \$5/g)).toHaveLength(2);
    expect(sql.match(/c\.embedding IS NOT NULL/g)).toHaveLength(2);
  });

  it('벡터 후보에서도 chunk 메타데이터 호환성과 레거시 실색인 예외를 검사한다', async () => {
    const chunks = { query: jest.fn()
      .mockResolvedValueOnce([result('vector-result', 0.8)])
      .mockResolvedValueOnce([]) };
    const metrics = { recordSearch: jest.fn(), recordRetrievalCandidates: jest.fn(), recordRetrievalFailure: jest.fn() };
    const service = Object.create(RagService.prototype) as any;
    Object.assign(service, {
      chunks,
      embeddings: { embed: jest.fn(async () => [0.1, 0.2]), toSqlVector: jest.fn(() => '[0.1,0.2]'), getMetadata: jest.fn(() => ({ provider: 'openai', model: 'text-embedding-3-small', mode: 'real', version: 'v1', dimension: 1536 })) },
      evidenceAssessment: { assess: jest.fn(async () => []) },
      metrics,
    });

    await expect(service.searchWithStatus('정글', 4)).resolves.toMatchObject({ status: 'INSUFFICIENT_EVIDENCE' });
    expect(service.evidenceAssessment.assess).toHaveBeenCalledWith('정글', expect.arrayContaining([expect.objectContaining({ chunkId: 'vector-result' })]));
    const sql = chunks.query.mock.calls[0][0] as string;
    expect(sql).toContain('c."embeddingModel" = $3');
    expect(sql).toContain('c."embeddingDimension" = $6');
    expect(sql).toContain('c."indexStatus" = \'ACTIVE\'');
    expect(sql).toContain('c."embeddingProvider" IS NULL');
    expect(sql).toContain('d."embeddingProvider" IS NULL');
    expect(metrics.recordRetrievalCandidates).toHaveBeenCalledWith(1, 0, 1);
  });

  it('벡터 조회 실패를 경로별 오류로 기록한다', async () => {
    const chunks = { query: jest.fn()
      .mockRejectedValueOnce(new Error('vector unavailable'))
      .mockResolvedValueOnce([]) };
    const metrics = { recordSearch: jest.fn(), recordRetrievalCandidates: jest.fn(), recordRetrievalFailure: jest.fn() };
    const service = Object.create(RagService.prototype) as any;
    Object.assign(service, {
      chunks,
      embeddings: { embed: jest.fn(async () => [0.1, 0.2]), toSqlVector: jest.fn(() => '[0.1,0.2]'), getMetadata: jest.fn(() => ({ provider: 'openai', model: 'text-embedding-3-small', mode: 'real', version: 'v1', dimension: 1536 })) },
      metrics,
    });

    await expect(service.searchWithStatus('정글', 4)).resolves.toMatchObject({ status: 'SEARCH_DEGRADED' });
    expect(metrics.recordRetrievalFailure).toHaveBeenCalledWith('vector');
    expect(metrics.recordRetrievalCandidates).not.toHaveBeenCalled();
  });

  it('키워드 조회 실패도 재시도한 횟수만큼 기록한다', async () => {
    const chunks = { query: jest.fn()
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error('lexical unavailable'))
      .mockRejectedValueOnce(new Error('lexical unavailable')) };
    const metrics = { recordSearch: jest.fn(), recordRetrievalCandidates: jest.fn(), recordRetrievalFailure: jest.fn() };
    const service = Object.create(RagService.prototype) as any;
    Object.assign(service, {
      chunks,
      embeddings: { embed: jest.fn(async () => [0.1, 0.2]), toSqlVector: jest.fn(() => '[0.1,0.2]'), getMetadata: jest.fn(() => ({ provider: 'openai', model: 'text-embedding-3-small', mode: 'real', version: 'v1', dimension: 1536 })) },
      metrics,
    });

    await expect(service.searchWithStatus('정글', 4)).resolves.toMatchObject({ status: 'SEARCH_DEGRADED' });
    expect(metrics.recordRetrievalFailure).toHaveBeenCalledTimes(2);
    expect(metrics.recordRetrievalFailure).toHaveBeenCalledWith('lexical');
  });

  it('호환되는 활성 chunk가 없으면 문서 상태와 무관하게 색인 없음으로 분류한다', async () => {
    const chunks = { query: jest.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ exists: false }]) };
    const service = Object.create(RagService.prototype) as any;
    Object.assign(service, {
      chunks,
      documents: { count: jest.fn(async () => 1) },
      embeddings: { embed: jest.fn(async () => [0.1, 0.2]), toSqlVector: jest.fn(() => '[0.1,0.2]'), getMetadata: jest.fn(() => ({ provider: 'openai', model: 'text-embedding-3-small', mode: 'real', version: 'v1', dimension: 1536 })) },
      metrics: { recordSearch: jest.fn(), recordRetrievalCandidates: jest.fn(), recordRetrievalFailure: jest.fn() },
    });

    await expect(service.searchWithStatus('정글', 4)).resolves.toMatchObject({ status: 'NO_ACTIVE_INDEX' });
    expect(chunks.query.mock.calls[2][0]).toContain('c."embeddingModel" = $2');
    expect(service.documents.count).not.toHaveBeenCalled();
    for (const [sql] of chunks.query.mock.calls) {
      expect(sql).toContain('d."sourceType" != \'BLOG_SEARCH\'');
    }
  });

  it('벡터와 키워드 후보에 모두 있는 chunk를 우선한다', () => {
    const service = Object.create(RagService.prototype) as { mergeSearchResults: (vector: RagSearchResult[], lexical: RagSearchResult[], limit: number) => RagSearchResult[] };
    const results = service.mergeSearchResults([result('vector-only'), result('shared')], [result('lexical-only'), result('shared')], 4);
    expect(results[0].chunkId).toBe('shared');
  });

  it('서로 다른 점수 척도를 직접 비교하지 않고 순위로 결합한다', () => {
    const service = Object.create(RagService.prototype) as { mergeSearchResults: (vector: RagSearchResult[], lexical: RagSearchResult[], limit: number) => RagSearchResult[] };
    const results = service.mergeSearchResults([result('vector', 0.01)], [result('lexical', 1)], 2);
    expect(results.map((item) => item.chunkId)).toEqual(['vector', 'lexical']);
  });

  it('같은 문서의 여러 chunk보다 서로 다른 문서를 우선한다', () => {
    const service = Object.create(RagService.prototype) as { mergeSearchResults: (vector: RagSearchResult[], lexical: RagSearchResult[], limit: number) => RagSearchResult[] };
    const results = service.mergeSearchResults(
      [result('doc-a-1', 0, 'doc-a'), result('doc-a-2', 0, 'doc-a'), result('doc-b-1', 0, 'doc-b')],
      [],
      2,
    );
    expect(results.map((item) => item.chunkId)).toEqual(['doc-a-1', 'doc-b-1']);
  });

  it('제목과 본문이 질의어에 직접 일치하는 후보를 재정렬한다', () => {
    const service = Object.create(RagService.prototype) as { rerankResults: (question: string, results: RagSearchResult[]) => RagSearchResult[] };
    const results = service.rerankResults('지원 일정', [
      { ...result('generic', 0.02), title: '안내', chunkText: '일반 안내입니다.' },
      { ...result('matching-title', 0.01), title: '지원 일정', chunkText: '지원 일정과 준비 사항입니다.' },
    ]);
    expect(results.map((item) => item.chunkId)).toEqual(['matching-title', 'generic']);
    expect(results[0].rerankScore).toBeGreaterThan(0);
  });
});
