import type { RagCandidateResponse, RagRetrievalStatus, RagSearchResponse, RagSearchResult } from '../rag.service';
import type { RetrievalEvaluationCase } from './retrieval-evaluation';

const DEFAULT_K = 4;

interface EvaluationQuestion {
  id: string;
  question: string;
  relevantDocumentIds: readonly string[];
  sufficient: boolean;
}

const EVALUATION_QUESTIONS: readonly EvaluationQuestion[] = [
  { id: 'Q01', question: '핀토스 주차 전에 어떤 운영체제 개념을 미리 살펴보면 좋을까요?', relevantDocumentIds: ['143dd54d-6720-4a26-81fb-63e0a4421cad'], sufficient: true },
  { id: 'Q02', question: '큰 프로젝트 경험이 없어도 지원서에 어떤 경험을 적을 수 있을까요?', relevantDocumentIds: ['229d1d42-98bb-46d3-8558-1c118d0a64ce', 'd30431bf-f555-46d0-9fce-bd2fd459f4d1'], sufficient: true },
  { id: 'Q03', question: 'malloc/free 문제를 디버깅할 때 어떤 순서로 확인하나요?', relevantDocumentIds: ['26691803-302b-4129-b7b7-226565de0671'], sufficient: true },
  { id: 'Q04', question: '팀 프로젝트에서 Git 충돌을 줄이기 위해 정한 규칙은 무엇인가요?', relevantDocumentIds: ['4f0c4396-bc17-4256-9b51-9ca4a7236c93'], sufficient: true },
  { id: 'Q05', question: '정글 1주차 알고리즘 학습을 복기할 때 무엇을 기록했나요?', relevantDocumentIds: ['539a3fd2-9609-4f03-9393-0899432d8445'], sufficient: true },
  { id: 'Q06', question: '입학 전에 C언어와 자료구조를 어디까지 준비했다는 사례가 있나요?', relevantDocumentIds: [], sufficient: false },
  { id: 'Q07', question: '정글 1기 수료자의 1년 뒤 경험은 어땠나요?', relevantDocumentIds: [], sufficient: false },
  { id: 'Q08', question: '다음 기수의 공식 지원 마감일은 언제인가요?', relevantDocumentIds: [], sufficient: false },
  { id: 'Q09', question: '등록금 환불 규정은 어떻게 되나요?', relevantDocumentIds: [], sufficient: false },
  { id: 'Q10', question: '정글에 지원하면 합격 확률이 몇 퍼센트인가요?', relevantDocumentIds: [], sufficient: false },
  { id: 'Q11', question: '크래프톤 정글 입소 전에 어떤 내용을 공부하고, 입소할 때 어떤 개인 물품을 챙겨야 하나요?', relevantDocumentIds: ['a68266aa-b916-40a8-bb67-8b77105206fd'], sufficient: false },
];

export interface LegacyBaselineRepository {
  vectorSearch(embedding: number[], limit: number): Promise<RagSearchResult[]>;
  latestBoardPostChunks(limit: number): Promise<RagSearchResult[]>;
}

export interface CandidateRetrieval {
  searchCandidatesWithEmbedding(question: string, embedding: number[], limit?: number): Promise<RagCandidateResponse>;
  assessCandidates(question: string, candidates: RagCandidateResponse): Promise<RagSearchResponse>;
}

export interface ComparableRetrievalArtifact {
  schemaVersion: 1;
  generatedAt: string;
  k: number;
  source: 'local-read-only-corpus';
  cases: RetrievalEvaluationCase[];
}

export interface ComparableRetrievalCollectionOptions {
  embedQuestions(questions: readonly string[]): Promise<number[][]>;
  repository: LegacyBaselineRepository;
  candidate: CandidateRetrieval;
  k?: number;
  now?: () => Date;
}

type IdOnlyRun = { status: RagRetrievalStatus; results: Array<{ chunkId: string; documentId: string }> };

export async function collectComparableRetrievalResults(options: ComparableRetrievalCollectionOptions): Promise<ComparableRetrievalArtifact> {
  const k = options.k ?? DEFAULT_K;
  if (!Number.isInteger(k) || k < 1) throw new Error('k는 양의 정수여야 합니다.');

  const embeddings = await options.embedQuestions(EVALUATION_QUESTIONS.map((item) => item.question));
  if (embeddings.length !== EVALUATION_QUESTIONS.length) throw new Error('질문별 embedding 수가 평가 세트와 일치하지 않습니다.');
  const boardPostChunks = await options.repository.latestBoardPostChunks(150);
  const cases: RetrievalEvaluationCase[] = [];

  for (const [index, item] of EVALUATION_QUESTIONS.entries()) {
    const [baseline, candidates] = await Promise.all([
      legacyBaselineSearch(item.question, embeddings[index], options.repository, k, boardPostChunks),
      options.candidate.searchCandidatesWithEmbedding(item.question, embeddings[index], k),
    ]);
    const candidate = await options.candidate.assessCandidates(item.question, candidates);
    cases.push({
      id: item.id,
      relevantDocumentIds: [...item.relevantDocumentIds],
      sufficient: item.sufficient,
      baseline: toIdOnlyRun(baseline),
      candidate: toIdOnlyRun(candidate),
    });
  }

  return {
    schemaVersion: 1,
    generatedAt: (options.now ?? (() => new Date()))().toISOString(),
    k,
    source: 'local-read-only-corpus',
    cases,
  };
}

export async function legacyBaselineSearch(
  question: string,
  embedding: number[],
  repository: LegacyBaselineRepository,
  limit: number,
  boardPostChunks?: readonly RagSearchResult[],
): Promise<{ status: RagRetrievalStatus; results: RagSearchResult[] }> {
  const [vectorRows, boardRows] = await Promise.all([
    repository.vectorSearch(embedding, limit),
    boardPostChunks ? Promise.resolve(boardPostChunks) : repository.latestBoardPostChunks(150),
  ]);
  const terms = whitespaceTerms(question);
  const lexicalRows = boardRows
    .map((row) => ({ ...row, score: tokenInclusionScore(`${row.chunkText} ${row.title}`, terms) }))
    .filter((row) => row.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
  const merged = new Map<string, RagSearchResult>();
  for (const row of [...vectorRows, ...lexicalRows]) {
    const existing = merged.get(row.chunkId);
    if (!existing || row.score > existing.score) merged.set(row.chunkId, row);
  }
  const results = [...merged.values()].sort((left, right) => right.score - left.score).slice(0, limit);
  return {
    results,
    status: results.length > 0 && results[0].score >= 0.05 ? 'SUFFICIENT_EVIDENCE' : 'INSUFFICIENT_EVIDENCE',
  };
}

function whitespaceTerms(question: string) {
  return new Set(question
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean));
}

function tokenInclusionScore(text: string, terms: ReadonlySet<string>) {
  const normalized = text.toLowerCase();
  const hits = [...terms].filter((term) => normalized.includes(term)).length;
  return hits / Math.max(terms.size, 1);
}

function toIdOnlyRun(run: { status: RagRetrievalStatus; results: readonly RagSearchResult[] }): IdOnlyRun {
  return {
    status: run.status,
    results: run.results.map(({ chunkId, documentId }) => ({ chunkId, documentId })),
  };
}
