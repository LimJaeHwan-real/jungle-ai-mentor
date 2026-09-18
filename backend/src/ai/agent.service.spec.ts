import { AgentService } from './agent.service';

describe('AgentService 검색 장애 처리', () => {
  const questions = () => ({
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => ({ ...value, id: 'question-1', isPublic: false, createdAt: new Date() })),
  });

  it('근거가 부족하고 외부 검색을 허용하지 않으면 LLM 답변을 만들지 않는다', async () => {
    const rag = { searchWithStatus: jest.fn(async () => ({ results: [{ chunkId: 'weak-chunk' }], status: 'INSUFFICIENT_EVIDENCE' })) };
    const llm = { answer: jest.fn() };
    const webSearch = { search: jest.fn() };
    const service = new AgentService(questions() as never, rag as never, {} as never, {} as never, llm as never, webSearch as never);

    const response = await service.ask({ id: 'user-1' } as never, { question: '정글 합격률은 몇 퍼센트인가요?' });

    expect(response.retrievalStatus).toBe('INSUFFICIENT_EVIDENCE');
    expect(response.answer).toContain('등록된 근거');
    expect(llm.answer).not.toHaveBeenCalled();
    expect(webSearch.search).not.toHaveBeenCalled();
  });

  it('외부 검색에 인용할 블로그가 없으면 답변 근거로 사용하지 않는다', async () => {
    const rag = { searchWithStatus: jest.fn(async () => ({ results: [], status: 'INSUFFICIENT_EVIDENCE' })) };
    const llm = { answer: jest.fn() };
    const webSearch = { search: jest.fn(async () => null) };
    const service = new AgentService(questions() as never, rag as never, {} as never, {} as never, llm as never, webSearch as never);

    const response = await service.ask({ id: 'user-1' } as never, { question: '정글 합격률은 몇 퍼센트인가요?', autoBlogSearch: true });

    expect(response.retrievalStatus).toBe('INSUFFICIENT_EVIDENCE');
    expect(response.answer).toContain('등록된 근거');
    expect(response.references).toEqual([]);
    expect(response.externalAugmentationStatus).toBe('SEARCHED_NOT_USED');
    expect(webSearch.search).toHaveBeenCalledTimes(1);
    expect(rag.searchWithStatus).toHaveBeenCalledTimes(1);
    expect(llm.answer).not.toHaveBeenCalled();
  });

  it('명시적으로 허용한 웹 검색 답변과 실제 인용 출처를 반환하고 DB에 저장하지 않는다', async () => {
    const rag = { searchWithStatus: jest.fn(async () => ({ results: [], status: 'INSUFFICIENT_EVIDENCE' })) };
    const llm = { answer: jest.fn() };
    const repository = questions();
    const reference = { type: 'WEB_SEARCH', title: '정글 후기', sourceUrl: 'https://jungle.tistory.com/123', startIndex: 8, endIndex: 11 };
    const webSearch = { search: jest.fn(async () => ({ answer: '정글 생활 후기 [1]', references: [reference] })) };
    const service = new AgentService(repository as never, rag as never, {} as never, {} as never, llm as never, webSearch as never);

    const response = await service.ask({ id: 'user-1' } as never, { question: '정글 과정에 팀 프로젝트가 있나요?', autoBlogSearch: true });

    expect(webSearch.search).toHaveBeenCalledWith('정글 과정에 팀 프로젝트가 있나요?');
    expect(rag.searchWithStatus).toHaveBeenCalledTimes(1);
    expect(response.retrievalStatus).toBe('INSUFFICIENT_EVIDENCE');
    expect(response.externalAugmentationStatus).toBe('EVIDENCE_USED');
    expect(response.references).toEqual([reference]);
    expect(response.answer).toBe('정글 생활 후기 [1]');
    expect(response.id).toBeNull();
    expect(repository.save).not.toHaveBeenCalled();
    expect(llm.answer).not.toHaveBeenCalled();
  });

  it('외부 블로그 검색 자체가 실패해도 내부 근거 부족 상태를 안전하게 반환한다', async () => {
    const rag = { searchWithStatus: jest.fn(async () => ({ results: [], status: 'INSUFFICIENT_EVIDENCE' })) };
    const llm = { answer: jest.fn() };
    const webSearch = { search: jest.fn(async () => { throw new Error('external search failed'); }) };
    const service = new AgentService(questions() as never, rag as never, {} as never, {} as never, llm as never, webSearch as never);

    const response = await service.ask({ id: 'user-1' } as never, { question: '정글 준비 방법 알려줘', autoBlogSearch: true });

    expect(response.retrievalStatus).toBe('INSUFFICIENT_EVIDENCE');
    expect(response.externalAugmentationStatus).toBe('FAILED');
    expect(response.answer).toContain('등록된 근거');
    expect(response.references).toEqual([]);
    expect(rag.searchWithStatus).toHaveBeenCalledTimes(1);
    expect(llm.answer).not.toHaveBeenCalled();
  });

  it('근거 번호가 없거나 범위를 벗어난 생성 답변은 표시하지 않는다', async () => {
    const selected = { chunkId: 'chunk-1', documentId: 'document-1', title: '정글 후기', chunkText: '팀 프로젝트를 진행했습니다.', category: 'BLOG', score: 0.3 };
    const rag = { searchWithStatus: jest.fn(async () => ({ results: [selected], status: 'SUFFICIENT_EVIDENCE' })) };
    const llm = { answer: jest.fn()
      .mockResolvedValueOnce('팀 프로젝트가 포함됩니다.')
      .mockResolvedValueOnce('팀 프로젝트가 포함됩니다. [2]') };
    const service = new AgentService(questions() as never, rag as never, {} as never, {} as never, llm as never, {} as never);

    const missing = await service.ask({ id: 'user-1' } as never, { question: '정글 과정에 팀 프로젝트가 있나요?' });
    const invalid = await service.ask({ id: 'user-1' } as never, { question: '정글 과정에 팀 프로젝트가 있나요?' });

    expect(missing.answer).toContain('근거 번호를 확인');
    expect(invalid.answer).toContain('근거 번호를 확인');
    expect(missing.agentState.answerCitationStatus).toBe('MISSING_OR_INVALID');
    expect(invalid.agentState.answerCitationStatus).toBe('MISSING_OR_INVALID');
  });

  it('GitHub 분석이 추가되어도 참고 근거 번호와 LLM 컨텍스트 순서를 일치시킨다', async () => {
    const selected = { chunkId: 'chunk-1', documentId: 'document-1', title: '프로젝트 자료', chunkText: 'https://github.com/jungle/example 저장소를 참고합니다.', category: 'BOARD_POST', score: 0.3 };
    const analysis = { repositoryUrl: 'https://github.com/jungle/example', owner: 'jungle', repo: 'example', summary: '학습 저장소', fallback: false };
    const rag = { searchWithStatus: jest.fn(async () => ({ results: [selected], status: 'SUFFICIENT_EVIDENCE' })) };
    const github = { analyze: jest.fn(async () => analysis) };
    const llm = { answer: jest.fn(async (_question: string, _contexts: { title: string }[]) => '프로젝트 자료를 참고했습니다. [1] 저장소 요약은 학습용입니다. [2]') };
    const repository = questions();
    const service = new AgentService(repository as never, rag as never, {} as never, github as never, llm as never, {} as never);

    const response = await service.ask({ id: 'user-1' } as never, { question: '정글 프로젝트 자료를 설명해 주세요.' });

    expect(response.references).toEqual([selected, analysis]);
    expect(llm.answer.mock.calls[0][1].map((context: { title: string }) => context.title)).toEqual(['프로젝트 자료', 'GitHub repository: jungle/example']);
    expect(response.agentState.answerCitationStatus).toBe('CITATION_IDS_VALID');
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('직접 요청한 GitHub 분석 답변도 질문 기록에 저장하지 않는다', async () => {
    const repository = questions();
    const github = { analyze: jest.fn(async () => ({ repositoryUrl: 'https://github.com/jungle/example', owner: 'jungle', repo: 'example', summary: '학습 저장소', fallback: false })) };
    const llm = { answer: jest.fn(async () => 'GitHub 프로젝트 분석입니다.') };
    const service = new AgentService(repository as never, {} as never, {} as never, github as never, llm as never, {} as never);

    const response = await service.ask({ id: 'user-1' } as never, { question: 'https://github.com/jungle/example 저장소를 분석해줘', repositoryUrl: 'https://github.com/jungle/example' });

    expect(response.id).toBeNull();
    expect(repository.save).not.toHaveBeenCalled();
    expect(github.analyze).toHaveBeenCalledTimes(1);
  });

  it('검색 장애 상태에서는 LLM 답변과 외부 검색을 실행하지 않는다', async () => {
    const questions = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ ...value, id: 'question-1', isPublic: false, createdAt: new Date() })),
    };
    const rag = { searchWithStatus: jest.fn(async () => ({ results: [{ chunkId: 'chunk-1' }], status: 'SEARCH_DEGRADED' })) };
    const llm = { answer: jest.fn() };
    const webSearch = { search: jest.fn() };
    const service = new AgentService(questions as never, rag as never, {} as never, {} as never, llm as never, webSearch as never);

    const response = await service.ask({ id: 'user-1' } as never, { question: '정글 지원 일정 알려줘', autoBlogSearch: true });

    expect(response.retrievalStatus).toBe('SEARCH_DEGRADED');
    expect(response.references).toEqual([]);
    expect(response.answer).toContain('일시적인 문제');
    expect(llm.answer).not.toHaveBeenCalled();
    expect(webSearch.search).not.toHaveBeenCalled();
  });

  it('활성 색인이 없을 때도 LLM 답변과 외부 검색을 실행하지 않는다', async () => {
    const questions = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ ...value, id: 'question-2', isPublic: false, createdAt: new Date() })),
    };
    const rag = { searchWithStatus: jest.fn(async () => ({ results: [], status: 'NO_ACTIVE_INDEX' })) };
    const llm = { answer: jest.fn() };
    const webSearch = { search: jest.fn() };
    const service = new AgentService(questions as never, rag as never, {} as never, {} as never, llm as never, webSearch as never);

    const response = await service.ask({ id: 'user-1' } as never, { question: '정글 지원 일정 알려줘', autoBlogSearch: true });

    expect(response.retrievalStatus).toBe('NO_ACTIVE_INDEX');
    expect(response.answer).toContain('활성 지식 색인');
    expect(llm.answer).not.toHaveBeenCalled();
    expect(webSearch.search).not.toHaveBeenCalled();
  });
});
