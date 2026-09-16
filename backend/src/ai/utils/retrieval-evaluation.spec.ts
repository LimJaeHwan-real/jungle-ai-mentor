import { compareRetrievalRuns, evaluateRetrievalRun } from './retrieval-evaluation';

describe('RAG 검색 오프라인 평가', () => {
  const cases = [
    {
      id: 'Q01',
      relevantDocumentIds: ['doc-a', 'doc-b'],
      sufficient: true,
      baseline: { status: 'SUFFICIENT_EVIDENCE', results: [
        { chunkId: 'x1', documentId: 'doc-x' },
        { chunkId: 'a1', documentId: 'doc-a' },
        { chunkId: 'a2', documentId: 'doc-a' },
      ] },
      candidate: { status: 'SUFFICIENT_EVIDENCE', results: [
        { chunkId: 'a1', documentId: 'doc-a' },
        { chunkId: 'b1', documentId: 'doc-b' },
      ] },
    },
    {
      id: 'Q02',
      relevantDocumentIds: [],
      sufficient: false,
      baseline: { status: 'SUFFICIENT_EVIDENCE', results: [{ chunkId: 'x2', documentId: 'doc-x' }] },
      candidate: { status: 'INSUFFICIENT_EVIDENCE', results: [] },
    },
    {
      id: 'Q03',
      relevantDocumentIds: [],
      sufficient: null,
      baseline: { status: 'INSUFFICIENT_EVIDENCE', results: [] },
      candidate: { status: 'INSUFFICIENT_EVIDENCE', results: [] },
    },
  ] as const;

  it('중복 문서를 정답 두 건으로 세지 않고 순위·충분성 지표를 계산한다', () => {
    const report = compareRetrievalRuns(cases, 3);

    expect(report.baseline).toMatchObject({
      caseCount: 3,
      relevanceCaseCount: 1,
      sufficiencyCaseCount: 2,
      recallAtK: 0.5,
      mrr: 0.5,
      topSourceAccuracy: 0,
      duplicateRate: 0.25,
      sufficiencyPrecision: 0.5,
      sufficiencyRecall: 1,
    });
    expect(report.candidate).toMatchObject({
      recallAtK: 1,
      mrr: 1,
      topSourceAccuracy: 1,
      duplicateRate: 0,
      sufficiencyPrecision: 1,
      sufficiencyRecall: 1,
    });
    expect(report.candidate.ndcgAtK).toBe(1);
    expect(report.baseline.ndcgAtK).toBeGreaterThan(0);
    expect(report.baseline.ndcgAtK).toBeLessThan(1);
  });

  it('정답 자료가 없는 세트의 검색 지표는 0으로 꾸미지 않는다', () => {
    const report = evaluateRetrievalRun([cases[1], cases[2]], 'candidate', 3);

    expect(report.relevanceCaseCount).toBe(0);
    expect(report.recallAtK).toBeNull();
    expect(report.mrr).toBeNull();
    expect(report.ndcgAtK).toBeNull();
    expect(report.topSourceAccuracy).toBeNull();
  });

  it('평가 케이스가 중복되거나 충분 라벨에 정답 자료가 없으면 거부한다', () => {
    expect(() => compareRetrievalRuns([cases[0], cases[0]], 3)).toThrow('중복');
    expect(() => compareRetrievalRuns([{ ...cases[0], relevantDocumentIds: [] }], 3)).toThrow('정답 문서');
    expect(() => compareRetrievalRuns(cases, 0)).toThrow('k');
  });
});
