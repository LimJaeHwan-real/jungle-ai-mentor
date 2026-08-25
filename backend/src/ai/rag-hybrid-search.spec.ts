import { RagService, RagSearchResult } from './rag.service';

const result = (chunkId: string, score = 0, documentId = chunkId): RagSearchResult => ({ chunkId, documentId, title: chunkId, category: 'GENERAL', chunkText: chunkId, score });

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

  it('같은 문서의 여러 chunk보다 서로 다른 문서를 우선한다', () => {
    const service = Object.create(RagService.prototype) as { mergeSearchResults: (vector: RagSearchResult[], lexical: RagSearchResult[], limit: number) => RagSearchResult[] };
    const results = service.mergeSearchResults(
      [result('doc-a-1', 0, 'doc-a'), result('doc-a-2', 0, 'doc-a'), result('doc-b-1', 0, 'doc-b')],
      [],
      2,
    );
    expect(results.map((item) => item.chunkId)).toEqual(['doc-a-1', 'doc-b-1']);
  });
});
