import { AgentService } from './agent.service';

describe('AgentService 검색 장애 처리', () => {
  const questions = () => ({
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => ({ ...value, id: 'question-1', isPublic: false, createdAt: new Date() })),
  });

  it('근거가 부족하고 외부 검색을 허용하지 않으면 LLM 답변을 만들지 않는다', async () => {
    const rag = { searchWithStatus: jest.fn(async () => ({ results: [{ chunkId: 'weak-chunk' }], status: 'INSUFFICIENT_EVIDENCE' })) };
    const llm = { answer: jest.fn() };
    const blogSearch = { discoverAndImport: jest.fn() };
    const service = new AgentService(questions() as never, rag as never, {} as never, {} as never, llm as never, blogSearch as never);

    const response = await service.ask({ id: 'user-1' } as never, { question: '정글 합격률은 몇 퍼센트인가요?' });

    expect(response.retrievalStatus).toBe('INSUFFICIENT_EVIDENCE');
    expect(response.answer).toContain('등록된 근거');
    expect(llm.answer).not.toHaveBeenCalled();
    expect(blogSearch.discoverAndImport).not.toHaveBeenCalled();
  });

  it('블로그 보강 뒤에도 근거가 부족하면 외부 후보로 답변하지 않는다', async () => {
    const rag = { searchWithStatus: jest.fn()
      .mockResolvedValueOnce({ results: [], status: 'INSUFFICIENT_EVIDENCE' })
      .mockResolvedValueOnce({ results: [{ chunkId: 'weak-chunk' }], status: 'INSUFFICIENT_EVIDENCE' }) };
    const llm = { answer: jest.fn() };
    const blogSearch = { discoverAndImport: jest.fn(async () => ({ mode: 'hybrid', query: '정글', importedCount: 0, references: [{ sourceUrl: 'https://example.com', imported: false }] })) };
    const service = new AgentService(questions() as never, rag as never, {} as never, {} as never, llm as never, blogSearch as never);

    const response = await service.ask({ id: 'user-1' } as never, { question: '정글 합격률은 몇 퍼센트인가요?', autoBlogSearch: true });

    expect(response.retrievalStatus).toBe('INSUFFICIENT_EVIDENCE');
    expect(response.answer).toContain('등록된 근거');
    expect(response.references).not.toContainEqual(expect.objectContaining({ sourceUrl: 'https://example.com' }));
    expect(llm.answer).not.toHaveBeenCalled();
  });

  it('블로그 보강 뒤 검색 장애가 나면 LLM 답변과 근거 표시를 건너뛴다', async () => {
    const rag = { searchWithStatus: jest.fn()
      .mockResolvedValueOnce({ results: [], status: 'INSUFFICIENT_EVIDENCE' })
      .mockResolvedValueOnce({ results: [{ chunkId: 'untrusted-chunk' }], status: 'SEARCH_DEGRADED' }) };
    const llm = { answer: jest.fn() };
    const blogSearch = { discoverAndImport: jest.fn(async () => ({ mode: 'hybrid', query: '정글', importedCount: 1, references: [{ sourceUrl: 'https://example.com', imported: true }] })) };
    const service = new AgentService(questions() as never, rag as never, {} as never, {} as never, llm as never, blogSearch as never);

    const response = await service.ask({ id: 'user-1' } as never, { question: '정글 준비 방법 알려줘', autoBlogSearch: true });

    expect(response.retrievalStatus).toBe('SEARCH_DEGRADED');
    expect(response.references).toEqual([]);
    expect(llm.answer).not.toHaveBeenCalled();
  });

  it('명시적으로 허용한 블로그 보강도 재검색에서 채택한 근거만 답변에 사용한다', async () => {
    const selected = { chunkId: 'selected-chunk', title: '정글 후기', chunkText: '정글 과정은 팀 프로젝트를 포함합니다.', category: 'BLOG', sourceUrl: 'https://example.com/selected', sectionPath: '과정 > 프로젝트', sourceStart: 15, sourceEnd: 39, chunkingVersion: 'markdown-cl100k-256-v2', score: 0.3 };
    const rag = { searchWithStatus: jest.fn()
      .mockResolvedValueOnce({ results: [], status: 'INSUFFICIENT_EVIDENCE' })
      .mockResolvedValueOnce({ results: [selected], status: 'SUFFICIENT_EVIDENCE' }) };
    const llm = { answer: jest.fn(async () => '팀 프로젝트가 포함됩니다. [1]') };
    const blogSearch = { discoverAndImport: jest.fn(async () => ({ mode: 'hybrid', query: '정글', importedCount: 1, references: [{ sourceUrl: 'https://example.com/unselected', imported: true }] })) };
    const service = new AgentService(questions() as never, rag as never, {} as never, {} as never, llm as never, blogSearch as never);

    const response = await service.ask({ id: 'user-1' } as never, { question: '정글 과정에 팀 프로젝트가 있나요?', autoBlogSearch: true });

    expect(blogSearch.discoverAndImport).toHaveBeenCalledTimes(1);
    expect(rag.searchWithStatus).toHaveBeenCalledTimes(2);
    expect(response.retrievalStatus).toBe('SUFFICIENT_EVIDENCE');
    expect(response.references).toEqual([selected]);
    expect(llm.answer).toHaveBeenCalledWith(
      '정글 과정에 팀 프로젝트가 있나요?',
      [expect.objectContaining({ title: selected.title, content: selected.chunkText, sourceUrl: selected.sourceUrl, chunkId: selected.chunkId, sectionPath: selected.sectionPath, sourceStart: selected.sourceStart, sourceEnd: selected.sourceEnd })],
      expect.any(String),
    );
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
    const analysis = { repositoryUrl: 'https://github.com/jungle/example', owner: 'jungle', repo: 'example', summary: '학습 저장소', fileHints: [], fallback: false };
    const rag = { searchWithStatus: jest.fn(async () => ({ results: [selected], status: 'SUFFICIENT_EVIDENCE' })) };
    const github = { analyze: jest.fn(async () => analysis) };
    const llm = { answer: jest.fn(async (_question: string, _contexts: { title: string }[]) => '프로젝트 자료를 참고했습니다. [1] 저장소 요약은 학습용입니다. [2]') };
    const service = new AgentService(questions() as never, rag as never, {} as never, github as never, llm as never, {} as never);

    const response = await service.ask({ id: 'user-1' } as never, { question: '정글 프로젝트 자료를 설명해 주세요.' });

    expect(response.references).toEqual([selected, analysis]);
    expect(llm.answer.mock.calls[0][1].map((context: { title: string }) => context.title)).toEqual(['프로젝트 자료', 'GitHub repository: jungle/example']);
    expect(response.agentState.answerCitationStatus).toBe('CITATION_IDS_VALID');
  });

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

  it('활성 색인이 없을 때도 LLM 답변과 외부 검색을 실행하지 않는다', async () => {
    const questions = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ ...value, id: 'question-2', isPublic: false, createdAt: new Date() })),
    };
    const rag = { searchWithStatus: jest.fn(async () => ({ results: [], status: 'NO_ACTIVE_INDEX' })) };
    const llm = { answer: jest.fn() };
    const blogSearch = { discoverAndImport: jest.fn() };
    const service = new AgentService(questions as never, rag as never, {} as never, {} as never, llm as never, blogSearch as never);

    const response = await service.ask({ id: 'user-1' } as never, { question: '정글 지원 일정 알려줘', autoBlogSearch: true });

    expect(response.retrievalStatus).toBe('NO_ACTIVE_INDEX');
    expect(response.answer).toContain('활성 지식 색인');
    expect(llm.answer).not.toHaveBeenCalled();
    expect(blogSearch.discoverAndImport).not.toHaveBeenCalled();
  });
});
