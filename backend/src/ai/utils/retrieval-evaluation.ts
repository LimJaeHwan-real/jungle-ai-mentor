import type { RagRetrievalStatus } from '../rag.service';

export interface RetrievalEvaluationRun {
  status: RagRetrievalStatus;
  results: readonly { chunkId: string; documentId: string }[];
}

export interface RetrievalEvaluationCase {
  id: string;
  relevantDocumentIds: readonly string[];
  sufficient: boolean | null;
  baseline: RetrievalEvaluationRun;
  candidate: RetrievalEvaluationRun;
}

export interface RetrievalEvaluationReport {
  caseCount: number;
  relevanceCaseCount: number;
  sufficiencyCaseCount: number;
  k: number;
  recallAtK: number | null;
  mrr: number | null;
  ndcgAtK: number | null;
  topSourceAccuracy: number | null;
  duplicateRate: number | null;
  sufficiencyPrecision: number | null;
  sufficiencyRecall: number | null;
}

export function compareRetrievalRuns(cases: readonly RetrievalEvaluationCase[], k: number) {
  validateCases(cases, k);
  return {
    baseline: evaluateRetrievalRun(cases, 'baseline', k),
    candidate: evaluateRetrievalRun(cases, 'candidate', k),
  };
}

export function evaluateRetrievalRun(cases: readonly RetrievalEvaluationCase[], run: 'baseline' | 'candidate', k: number): RetrievalEvaluationReport {
  validateCases(cases, k);
  let relevanceCaseCount = 0;
  let sufficiencyCaseCount = 0;
  let recall = 0;
  let reciprocalRank = 0;
  let ndcg = 0;
  let topSourceCorrect = 0;
  let duplicateCount = 0;
  let resultCount = 0;
  let truePositive = 0;
  let falsePositive = 0;
  let falseNegative = 0;

  for (const item of cases) {
    const expected = new Set(item.relevantDocumentIds);
    const results = item[run].results.slice(0, k);
    const seenDocuments = new Set<string>();
    for (const result of results) {
      if (seenDocuments.has(result.documentId)) duplicateCount += 1;
      seenDocuments.add(result.documentId);
      resultCount += 1;
    }

    if (expected.size > 0) {
      relevanceCaseCount += 1;
      const firstRanks = new Map<string, number>();
      results.forEach((result, index) => {
        if (expected.has(result.documentId) && !firstRanks.has(result.documentId)) firstRanks.set(result.documentId, index + 1);
      });
      recall += firstRanks.size / expected.size;
      reciprocalRank += firstRanks.size ? 1 / Math.min(...firstRanks.values()) : 0;
      topSourceCorrect += results[0] && expected.has(results[0].documentId) ? 1 : 0;
      const actualDcg = [...firstRanks.values()].reduce((sum, rank) => sum + 1 / Math.log2(rank + 1), 0);
      const idealDcg = Array.from({ length: Math.min(expected.size, k) }, (_, index) => 1 / Math.log2(index + 2))
        .reduce((sum, value) => sum + value, 0);
      ndcg += actualDcg / idealDcg;
    }

    if (item.sufficient !== null) {
      sufficiencyCaseCount += 1;
      const predicted = item[run].status === 'SUFFICIENT_EVIDENCE';
      if (predicted && item.sufficient) truePositive += 1;
      if (predicted && !item.sufficient) falsePositive += 1;
      if (!predicted && item.sufficient) falseNegative += 1;
    }
  }

  return {
    caseCount: cases.length,
    relevanceCaseCount,
    sufficiencyCaseCount,
    k,
    recallAtK: relevanceCaseCount ? recall / relevanceCaseCount : null,
    mrr: relevanceCaseCount ? reciprocalRank / relevanceCaseCount : null,
    ndcgAtK: relevanceCaseCount ? ndcg / relevanceCaseCount : null,
    topSourceAccuracy: relevanceCaseCount ? topSourceCorrect / relevanceCaseCount : null,
    duplicateRate: resultCount ? duplicateCount / resultCount : null,
    sufficiencyPrecision: truePositive + falsePositive ? truePositive / (truePositive + falsePositive) : null,
    sufficiencyRecall: truePositive + falseNegative ? truePositive / (truePositive + falseNegative) : null,
  };
}

function validateCases(cases: readonly RetrievalEvaluationCase[], k: number) {
  if (!Number.isInteger(k) || k < 1) throw new Error('k는 양의 정수여야 합니다.');
  const ids = new Set<string>();
  for (const item of cases) {
    if (ids.has(item.id)) throw new Error(`중복 평가 ID: ${item.id}`);
    ids.add(item.id);
    if (item.sufficient === true && item.relevantDocumentIds.length === 0) {
      throw new Error(`충분 라벨에는 정답 문서가 필요합니다: ${item.id}`);
    }
  }
}
