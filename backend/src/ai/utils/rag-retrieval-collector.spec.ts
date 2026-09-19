import { collectComparableRetrievalResults, legacyBaselineSearch } from './rag-retrieval-collector';
import type { RagSearchResult } from '../rag.service';

const result = (chunkId: string, documentId: string, score: number, chunkText = ''): RagSearchResult => ({
  chunkId, documentId, score, chunkText, title: 'test', category: 'BOARD_POST',
});

describe('RAG 비교 결과 수집기', () => {
  it('고정 Q01-Q11을 한 번의 batch embedding으로 수집하고 ID 전용 결과를 만든다', async () => {
    const embedQuestions = jest.fn(async (questions: readonly string[]) => questions.map((_, index) => [index]));
    const candidateSearch = jest.fn(async (_question: string, _embedding: number[]) => ({
      results: [result('candidate-chunk', 'candidate-document', 0.9, 'candidate body')],
      status: 'CANDIDATES_FOUND' as const,
      startedAt: 0,
    }));
    const assess = jest.fn(async () => ({
      results: [result('candidate-chunk', 'candidate-document', 0.9, 'candidate body')],
      status: 'SUFFICIENT_EVIDENCE' as const,
    }));
    const repository = {
      vectorSearch: jest.fn(async () => [result('vector', 'vector-document', 0.06, 'vector body')]),
      latestBoardPostChunks: jest.fn(async () => [result('board', 'board-document', 0, 'unrelated')]),
    };

    const output = await collectComparableRetrievalResults({
      embedQuestions,
      repository,
      candidate: { searchCandidatesWithEmbedding: candidateSearch, assessCandidates: assess },
      now: () => new Date('2026-09-19T00:00:00.000Z'),
    });

    expect(embedQuestions).toHaveBeenCalledTimes(1);
    expect(embedQuestions.mock.calls[0][0]).toHaveLength(11);
    expect(candidateSearch).toHaveBeenCalledTimes(11);
    expect(assess).toHaveBeenCalledTimes(11);
    expect(repository.latestBoardPostChunks).toHaveBeenCalledWith(150);
    expect(output.cases).toHaveLength(11);
    expect(output.cases.map((item) => item.id)).toEqual(['Q01', 'Q02', 'Q03', 'Q04', 'Q05', 'Q06', 'Q07', 'Q08', 'Q09', 'Q10', 'Q11']);
    expect(output.cases.find((item) => item.id === 'Q02')?.relevantDocumentIds).toEqual([
      '229d1d42-98bb-46d3-8558-1c118d0a64ce',
      'd30431bf-f555-46d0-9fce-bd2fd459f4d1',
    ]);
    expect(output.cases.find((item) => item.id === 'Q11')).toMatchObject({
      relevantDocumentIds: ['a68266aa-b916-40a8-bb67-8b77105206fd'],
      sufficient: false,
    });
    expect(output.cases.filter((item) => /^Q(0[6-9]|10)$/.test(item.id)).every((item) => item.relevantDocumentIds.length === 0)).toBe(true);
    expect(JSON.stringify(output)).not.toContain('candidate body');
    expect(JSON.stringify(output)).not.toContain('vector body');
    expect(JSON.stringify(output)).not.toContain('question');
  });

  it('과거 baseline처럼 raw score max 병합과 BOARD_POST 공백 토큰 포함 점수를 적용한다', async () => {
    const repository = {
      vectorSearch: jest.fn(async () => [
        result('shared', 'vector-document', 0.06),
        result('vector', 'vector-only', 0.05),
      ]),
      latestBoardPostChunks: jest.fn(async () => [
        result('shared', 'board-document', 0, 'alpha beta'),
        result('board', 'board-only', 0, 'beta beta'),
      ]),
    };

    const search = await legacyBaselineSearch('alpha beta', [0.1], repository, 2);

    expect(search.status).toBe('SUFFICIENT_EVIDENCE');
    expect(search.results.map((item) => item.chunkId)).toEqual(['shared', 'board']);
    expect(search.results[0].documentId).toBe('board-document');
  });

  it('baseline 최고 점수가 0.05 미만이면 결과가 있어도 insufficient로 분류한다', async () => {
    const search = await legacyBaselineSearch('alpha', [0.1], {
      vectorSearch: async () => [result('low', 'doc-low', 0.049)],
      latestBoardPostChunks: async () => [],
    }, 4);

    expect(search).toMatchObject({ status: 'INSUFFICIENT_EVIDENCE', results: [{ chunkId: 'low', documentId: 'doc-low' }] });
  });

  it('batch embedding 실패 시 mock 전환이나 검색을 하지 않고 실패를 반환한다', async () => {
    const repository = { vectorSearch: jest.fn(), latestBoardPostChunks: jest.fn() };
    const candidate = { searchCandidatesWithEmbedding: jest.fn(), assessCandidates: jest.fn() };

    await expect(collectComparableRetrievalResults({
      embedQuestions: async () => { throw new Error('embedding unavailable'); },
      repository,
      candidate,
    })).rejects.toThrow('embedding unavailable');

    expect(repository.vectorSearch).not.toHaveBeenCalled();
    expect(candidate.searchCandidatesWithEmbedding).not.toHaveBeenCalled();
  });
});
