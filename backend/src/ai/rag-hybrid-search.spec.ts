import { RagService, RagSearchResult } from './rag.service';

const result = (chunkId: string, score = 0): RagSearchResult => ({ chunkId, documentId: chunkId, title: chunkId, category: 'GENERAL', chunkText: chunkId, score });

describe('RagService RRF 후보 결합', () => {
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
});
