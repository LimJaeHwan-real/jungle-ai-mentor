import { ReadOnlyRagCollectorRepository } from './read-only-rag-collector-repository';

describe('읽기 전용 RAG 수집 DB 경계', () => {
  it('SELECT와 WITH 조회만 실행하고 변경 SQL은 DB에 전달하지 않는다', async () => {
    const query = jest.fn<Promise<unknown[]>, [string, unknown[]?]>(async () => []);
    const repository = new ReadOnlyRagCollectorRepository({ query });

    await expect(repository.query('UPDATE documents SET title = $1', ['changed'])).rejects.toThrow('읽기 전용');
    expect(query).not.toHaveBeenCalled();
    await expect(repository.latestBoardPostChunks(150)).resolves.toEqual([]);
    expect(query.mock.calls[0][0]).toMatch(/^\s*SELECT/i);
    expect(query.mock.calls[0][0]).toContain("d.category = 'BOARD_POST'");
    expect(query.mock.calls[0][0]).toContain('LIMIT $1');
  });

  it('legacy vector 조회는 과거 raw-score 비교에 필요한 점수와 활성 색인만 읽는다', async () => {
    const query = jest.fn<Promise<unknown[]>, [string, unknown[]?]>(async () => []);
    const repository = new ReadOnlyRagCollectorRepository({ query });

    await repository.vectorSearch([0.1, 0.2], 4);

    expect(query.mock.calls[0][0]).toMatch(/^\s*SELECT/i);
    expect(query.mock.calls[0][0]).toContain('1 - (c.embedding <=> $1::vector) AS score');
    expect(query.mock.calls[0][0]).toContain("d.\"indexStatus\" = 'ACTIVE'");
    expect(query.mock.calls[0][1]).toEqual(['[0.1,0.2]', 4, 'text-embedding-3-small', 'real', 'v1', 1536]);
  });
});
