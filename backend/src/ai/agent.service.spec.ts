import { AgentService } from './agent.service';

describe('AgentService 검색 장애 처리', () => {
  it('검색 장애 상태에서는 LLM 답변과 외부 검색을 실행하지 않는다', async () => {
    const questions = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ ...value, id: 'question-1', isPublic: false, createdAt: new Date() })),
    };
    const rag = { searchWithStatus: jest.fn(async () => ({ results: [{ chunkId: 'chunk-1' }], status: 'SEARCH_DEGRADED' })) };
    const llm = { answer: jest.fn() };
    const blogSearch = { discoverAndImport: jest.fn() };
    const service = new AgentService(questions as never, rag as never, {} as never, {} as never, llm as never, blogSearch as never);

    const response = await service.ask({ id: 'user-1' } as never, { question: '정글 지원 일정 알려줘', autoBlogSearch: true });

    expect(response.retrievalStatus).toBe('SEARCH_DEGRADED');
    expect(response.references).toEqual([]);
    expect(response.answer).toContain('일시적인 문제');
    expect(llm.answer).not.toHaveBeenCalled();
    expect(blogSearch.discoverAndImport).not.toHaveBeenCalled();
  });
});
