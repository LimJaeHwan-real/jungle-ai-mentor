import { AgentService } from './agent.service';
import { AgentRoute } from './entities/ai-question.entity';

describe('AgentService 검색 장애 처리', () => {
  const emptyFaq = { searchForAgent: jest.fn(async () => []) };
  const questions = () => ({
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => ({ ...value, id: 'question-1', isPublic: false, createdAt: new Date() })),
  });

  it('정글과 무관한 GENERAL 질문도 내부 검색 후 질문 주제로 웹 후기를 찾고 외부 답변을 저장하지 않는다', async () => {
    const repository = questions();
    const rag = {
      searchWithStatus: jest.fn(async () => ({ results: [], status: 'INSUFFICIENT_EVIDENCE' })),
    };
    const reference = { type: 'WEB_SEARCH', title: '게임랩 면접 후기', sourceUrl: 'https://example.tistory.com/review', startIndex: 8, endIndex: 11 };
    const webSearch = { search: jest.fn(async () => ({ answer: '게임랩 면접 후기 [1]', references: [reference] })) };
    const llm = { answer: jest.fn() };
    const service = new AgentService(repository as never, rag as never, emptyFaq as never, {} as never, llm as never, webSearch as never);
    const question = '게임랩, 게임 테크랩 최근 면접 후기 내용을 요약해줘';

    const response = await service.ask({ id: 'user-1' } as never, { question });

    expect(response.agentRoute).toBe(AgentRoute.GENERAL);
    expect(rag.searchWithStatus).toHaveBeenCalledWith(question, 4, []);
    expect(webSearch.search).toHaveBeenCalledWith(question, 'RECENT_REVIEW');
    expect(response.externalAugmentationStatus).toBe('EVIDENCE_USED');
    expect(response).toMatchObject({ answerStatus: 'WEB_EVIDENCE' });
    expect(response.references).toEqual([reference]);
    expect(response.id).toBeNull();
    expect(repository.save).not.toHaveBeenCalled();
    expect(llm.answer).not.toHaveBeenCalled();
  });

  it('최근 후기도 내부 근거 판정이 부족으로 끝난 뒤에만 웹 검색을 시작한다', async () => {
    let finishAssessment!: (value: { results: unknown[]; status: string }) => void;
    const candidate = { chunkId: 'chunk-1', documentId: 'document-1', title: '오래된 게시글', chunkText: '예전 후기', category: 'BOARD_POST', score: 1 / 61 };
    const assessment = new Promise<{ results: unknown[]; status: string }>((resolve) => { finishAssessment = resolve; });
    const rag = {
      searchWithStatus: jest.fn(() => assessment),
    };
    const webSearch = { search: jest.fn(async () => ({ answer: '최근 후기 [1]', references: [{ type: 'WEB_SEARCH', sourceUrl: 'https://example.tistory.com/review' }] })) };
    const service = new AgentService(questions() as never, rag as never, emptyFaq as never, {} as never, { answer: jest.fn() } as never, webSearch as never);

    const pending = service.ask({ id: 'user-1' } as never, { question: '최근 면접 후기 알려줘' });
    await new Promise((resolve) => setImmediate(resolve));
    expect(webSearch.search).not.toHaveBeenCalled();
    finishAssessment({ results: [candidate], status: 'INSUFFICIENT_EVIDENCE' });
    await expect(pending).resolves.toMatchObject({ answer: '최근 후기 [1]', agentRoute: AgentRoute.GENERAL });
    expect(webSearch.search).toHaveBeenCalledTimes(1);
    expect(rag.searchWithStatus).toHaveBeenCalledTimes(1);
  });

  it('최근 후기에 충분한 내부 근거가 있으면 웹 검색 없이 답한다', async () => {
    const selected = { chunkId: 'chunk-1', documentId: 'document-1', title: '최근 면접 후기', chunkText: '2026년 면접에서 알고리즘을 물었습니다.', category: 'BOARD_POST', score: 0.2 };
    const rag = {
      searchWithStatus: jest.fn(async () => ({ results: [selected], status: 'SUFFICIENT_EVIDENCE' })),
    };
    const webSearch = { search: jest.fn(async () => null) };
    const llm = { answer: jest.fn(async () => '알고리즘 질문이 있었습니다. [1]') };
    const repository = questions();
    const service = new AgentService(repository as never, rag as never, emptyFaq as never, {} as never, llm as never, webSearch as never);

    const response = await service.ask({ id: 'user-1' } as never, { question: '최근 면접 후기 알려줘' });

    expect(response.answer).toBe('알고리즘 질문이 있었습니다. [1]');
    expect(response.externalAugmentationStatus).toBe('NOT_REQUESTED');
    expect(webSearch.search).not.toHaveBeenCalled();
    expect(repository.save).toHaveBeenCalledTimes(1);
  });

  it('최근 후기에 충분한 내부 근거가 있으면 웹 인용 답변으로 덮어쓰지 않는다', async () => {
    const candidate = { chunkId: 'chunk-1', documentId: 'document-1', title: '내부 후기', chunkText: '2026년 면접 후기', category: 'BOARD_POST', score: 0.2 };
    const rag = {
      searchWithStatus: jest.fn(async () => ({ results: [candidate], status: 'SUFFICIENT_EVIDENCE' })),
    };
    const webSearch = { search: jest.fn(async () => ({ answer: '웹 후기 [1]', references: [{ type: 'WEB_SEARCH', sourceUrl: 'https://example.tistory.com/review' }] })) };
    const llm = { answer: jest.fn(async () => '내부 후기입니다. [1]') };
    const repository = questions();
    const service = new AgentService(repository as never, rag as never, emptyFaq as never, {} as never, llm as never, webSearch as never);

    const response = await service.ask({ id: 'user-1' } as never, { question: '최근 면접 후기 알려줘' });

    expect(response.answer).toBe('내부 후기입니다. [1]');
    expect(response.references).toEqual([candidate]);
    expect(webSearch.search).not.toHaveBeenCalled();
    expect(repository.save).toHaveBeenCalledTimes(1);
    expect(llm.answer).toHaveBeenCalledTimes(1);
  });

  it('검색 후 내부 근거 판정이 실패하면 웹을 시작하지 않고 기록도 저장하지 않는다', async () => {
    const candidate = { chunkId: 'chunk-1', documentId: 'document-1', title: '내부 후기', chunkText: '면접 후기', category: 'BOARD_POST', score: 0.2 };
    const rag = {
      searchWithStatus: jest.fn(async () => ({ results: [], status: 'SEARCH_DEGRADED' })),
    };
    const webSearch = { search: jest.fn(async () => ({ answer: '웹 후기 [1]', references: [{ type: 'WEB_SEARCH', sourceUrl: 'https://example.tistory.com/review' }] })) };
    const repository = questions();
    const service = new AgentService(repository as never, rag as never, emptyFaq as never, {} as never, { answer: jest.fn() } as never, webSearch as never);

    const response = await service.ask({ id: 'user-1' } as never, { question: '최근 면접 후기 알려줘' });

    expect(webSearch.search).not.toHaveBeenCalled();
    expect(response.retrievalStatus).toBe('SEARCH_DEGRADED');
    expect(response.answer).toContain('근거 검색 서비스');
    expect(response.references).toEqual([]);
    expect(response.id).toBeNull();
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('최근 후기라도 내부 검색 장애라면 웹 검색을 시작하지 않는다', async () => {
    const rag = {
      searchWithStatus: jest.fn(async () => ({ results: [], status: 'SEARCH_DEGRADED' })),
    };
    const webSearch = { search: jest.fn() };
    const service = new AgentService(questions() as never, rag as never, emptyFaq as never, {} as never, { answer: jest.fn() } as never, webSearch as never);

    const response = await service.ask({ id: 'user-1' } as never, { question: '최근 면접 후기 알려줘' });

    expect(response.retrievalStatus).toBe('SEARCH_DEGRADED');
    expect(webSearch.search).not.toHaveBeenCalled();
  });

  it('공식 사실의 내부 근거가 부족하면 공식 원문 검색을 요청한다', async () => {
    const rag = { searchWithStatus: jest.fn(async () => ({ results: [], status: 'INSUFFICIENT_EVIDENCE' })) };
    const webSearch = { search: jest.fn(async () => null) };
    const service = new AgentService(questions() as never, rag as never, emptyFaq as never, {} as never, { answer: jest.fn() } as never, webSearch as never);

    const response = await service.ask({ id: 'user-1' } as never, { question: '등록금 환불 규정은 무엇인가요?' });

    expect(response.agentRoute).toBe(AgentRoute.GENERAL);
    expect(webSearch.search).toHaveBeenCalledWith('등록금 환불 규정은 무엇인가요?', 'OFFICIAL_FACT');
  });

  it('근거가 부족하면 별도 선택값 없이 웹 검색을 한 번 시도하고 출처가 없을 때 LLM 답변을 만들지 않는다', async () => {
    const rag = { searchWithStatus: jest.fn(async () => ({ results: [{ chunkId: 'weak-chunk' }], status: 'INSUFFICIENT_EVIDENCE' })) };
    const llm = { answer: jest.fn() };
    const webSearch = { search: jest.fn(async () => null) };
    const repository = questions();
    const service = new AgentService(repository as never, rag as never, emptyFaq as never, {} as never, llm as never, webSearch as never);

    const response = await service.ask({ id: 'user-1' } as never, { question: '정글 합격률은 몇 퍼센트인가요?' });

    expect(response.retrievalStatus).toBe('INSUFFICIENT_EVIDENCE');
    expect(response.answer).toContain('현재 연결된 내부 자료와 웹 검색에서 질문에 답할 만한 근거를 찾지 못했습니다');
    expect(response.externalAugmentationStatus).toBe('SEARCHED_NOT_USED');
    expect(response).toMatchObject({ answerStatus: 'NO_EVIDENCE' });
    expect(response.id).toBeNull();
    expect(repository.save).not.toHaveBeenCalled();
    expect(llm.answer).not.toHaveBeenCalled();
    expect(webSearch.search).toHaveBeenCalledTimes(1);
  });

  it('이전 클라이언트가 검색을 끄는 값을 보내도 근거가 부족하면 검색하고 인용할 블로그가 없을 때 사용하지 않는다', async () => {
    const rag = { searchWithStatus: jest.fn(async () => ({ results: [], status: 'INSUFFICIENT_EVIDENCE' })) };
    const llm = { answer: jest.fn() };
    const webSearch = { search: jest.fn(async () => null) };
    const service = new AgentService(questions() as never, rag as never, emptyFaq as never, {} as never, llm as never, webSearch as never);

    const response = await service.ask({ id: 'user-1' } as never, { question: '정글 합격률은 몇 퍼센트인가요?', autoBlogSearch: false } as never);

    expect(response.retrievalStatus).toBe('INSUFFICIENT_EVIDENCE');
    expect(response.answer).toContain('현재 연결된 내부 자료와 웹 검색');
    expect(response.references).toEqual([]);
    expect(response.externalAugmentationStatus).toBe('SEARCHED_NOT_USED');
    expect(webSearch.search).toHaveBeenCalledTimes(1);
    expect(rag.searchWithStatus).toHaveBeenCalledTimes(1);
    expect(llm.answer).not.toHaveBeenCalled();
  });

  it('자동 웹 검색 답변과 실제 인용 출처를 반환하고 DB에 저장하지 않는다', async () => {
    const rag = { searchWithStatus: jest.fn(async () => ({ results: [], status: 'INSUFFICIENT_EVIDENCE' })) };
    const llm = { answer: jest.fn() };
    const repository = questions();
    const reference = { type: 'WEB_SEARCH', title: '정글 후기', sourceUrl: 'https://jungle.tistory.com/123', startIndex: 8, endIndex: 11 };
    const webSearch = { search: jest.fn(async () => ({ answer: '정글 생활 후기 [1]', references: [reference] })) };
    const service = new AgentService(repository as never, rag as never, emptyFaq as never, {} as never, llm as never, webSearch as never);

    const response = await service.ask({ id: 'user-1' } as never, { question: '정글 과정에 팀 프로젝트가 있나요?' });

    expect(webSearch.search).toHaveBeenCalledWith('정글 과정에 팀 프로젝트가 있나요?', 'GENERAL_KNOWLEDGE');
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
    const repository = questions();
    const service = new AgentService(repository as never, rag as never, emptyFaq as never, {} as never, llm as never, webSearch as never);

    const response = await service.ask({ id: 'user-1' } as never, { question: '정글 준비 방법 알려줘' });

    expect(response.retrievalStatus).toBe('INSUFFICIENT_EVIDENCE');
    expect(response.externalAugmentationStatus).toBe('FAILED');
    expect(response).toMatchObject({ answerStatus: 'WEB_SEARCH_FAILED' });
    expect(response.id).toBeNull();
    expect(response.answer).toContain('등록된 근거');
    expect(response.references).toEqual([]);
    expect(rag.searchWithStatus).toHaveBeenCalledTimes(1);
    expect(llm.answer).not.toHaveBeenCalled();
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('근거 번호가 없거나 범위를 벗어난 생성 답변은 표시하지 않는다', async () => {
    const selected = { chunkId: 'chunk-1', documentId: 'document-1', title: '정글 후기', chunkText: '팀 프로젝트를 진행했습니다.', category: 'BLOG', score: 0.3 };
    const rag = { searchWithStatus: jest.fn(async () => ({ results: [selected], status: 'SUFFICIENT_EVIDENCE' })) };
    const llm = { answer: jest.fn()
      .mockResolvedValueOnce('팀 프로젝트가 포함됩니다.')
      .mockResolvedValueOnce('팀 프로젝트가 포함됩니다. [2]') };
    const repository = questions();
    const service = new AgentService(repository as never, rag as never, emptyFaq as never, {} as never, llm as never, {} as never);

    const missing = await service.ask({ id: 'user-1' } as never, { question: '정글 과정에 팀 프로젝트가 있나요?' });
    const invalid = await service.ask({ id: 'user-1' } as never, { question: '정글 과정에 팀 프로젝트가 있나요?' });

    expect(missing.answer).toContain('근거 번호를 확인');
    expect(invalid.answer).toContain('근거 번호를 확인');
    expect(missing.agentState.answerCitationStatus).toBe('MISSING_OR_INVALID');
    expect(invalid.agentState.answerCitationStatus).toBe('MISSING_OR_INVALID');
    expect(missing.id).toBeNull();
    expect(invalid.id).toBeNull();
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('GENERAL 내부 게시글에 GitHub URL이 있어도 별도 외부 분석을 시작하지 않는다', async () => {
    const selected = { chunkId: 'chunk-1', documentId: 'document-1', title: '프로젝트 자료', chunkText: 'https://github.com/jungle/example 저장소를 참고합니다.', category: 'BOARD_POST', score: 0.3 };
    const rag = { searchWithStatus: jest.fn(async () => ({ results: [selected], status: 'SUFFICIENT_EVIDENCE' })) };
    const github = { analyze: jest.fn() };
    const llm = { answer: jest.fn(async (_question: string, _contexts: { title: string }[]) => '프로젝트 자료를 참고했습니다. [1]') };
    const repository = questions();
    const service = new AgentService(repository as never, rag as never, emptyFaq as never, github as never, llm as never, {} as never);

    const response = await service.ask({ id: 'user-1' } as never, { question: '정글 프로젝트 자료를 설명해 주세요.' });

    expect(response.references).toEqual([selected]);
    expect(llm.answer.mock.calls[0][1].map((context: { title: string }) => context.title)).toEqual(['프로젝트 자료']);
    expect(response.agentState.answerCitationStatus).toBe('CITATION_IDS_VALID');
    expect(github.analyze).not.toHaveBeenCalled();
    expect(repository.save).toHaveBeenCalledTimes(1);
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

  it('내부 근거가 충분해도 답변 생성 장애에는 기록이나 신뢰 FAQ 표식을 만들지 않는다', async () => {
    const candidate = { chunkId: 'chunk-1', documentId: 'document-1', title: '정글 후기', chunkText: '팀 프로젝트를 진행했습니다.', category: 'BOARD_POST', score: 0.2 };
    const rag = { searchWithStatus: jest.fn(async () => ({ results: [candidate], status: 'SUFFICIENT_EVIDENCE' })) };
    const llm = { answer: jest.fn(async () => { throw new Error('model unavailable'); }) };
    const repository = questions();
    const service = new AgentService(repository as never, rag as never, emptyFaq as never, {} as never, llm as never, {} as never);

    const response = await service.ask({ id: 'user-1' } as never, { question: '팀 프로젝트가 있나요?' });

    expect(response).toMatchObject({ id: null, answerStatus: 'ANSWER_GENERATION_FAILED', references: [] });
    expect(response.agentState.trustedInternalEvidence).toBeUndefined();
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('GitHub 조회가 모의 결과로 대체되면 근거 있는 분석으로 표시하거나 LLM에 전달하지 않는다', async () => {
    const repository = questions();
    const github = { analyze: jest.fn(async () => ({ repositoryUrl: 'https://github.com/jungle/example', owner: 'jungle', repo: 'example', summary: 'Mock README', fallback: true })) };
    const llm = { answer: jest.fn() };
    const service = new AgentService(repository as never, {} as never, {} as never, github as never, llm as never, {} as never);

    const response = await service.ask({ id: 'user-1' } as never, { question: 'https://github.com/jungle/example 저장소를 분석해줘' });

    expect(response).toMatchObject({ id: null, answerStatus: 'GITHUB_ANALYSIS_FAILED', references: [] });
    expect(response.answer).toContain('GitHub 저장소 내용을 확인하지 못했습니다');
    expect(llm.answer).not.toHaveBeenCalled();
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('GENERAL 질문은 FAQ와 게시글 후보를 함께 판정하고 선택된 FAQ 근거만 답변에 사용한다', async () => {
    const repository = questions();
    const faqResult = { faqId: 'faq-1', chunkId: 'faq:faq-1', documentId: 'faq:faq-1', title: '가상 메모리 안내', chunkText: '페이지 테이블을 먼저 공부하세요.', category: 'FAQ', score: 0.5 };
    const faq = { searchForAgent: jest.fn(async () => [faqResult]) };
    const rag = { searchWithStatus: jest.fn(async () => ({ results: [faqResult], status: 'SUFFICIENT_EVIDENCE' })) };
    const llm = { answer: jest.fn(async (_question: string, _contexts: { title: string }[]) => '페이지 테이블을 공부하세요. [1]') };
    const github = { analyze: jest.fn() };
    const webSearch = { search: jest.fn() };
    const service = new AgentService(repository as never, rag as never, faq as never, github as never, llm as never, webSearch as never);

    const response = await service.ask({ id: 'user-1' } as never, { question: '핀토스에서 가상 메모리를 준비하는 법은?' });

    expect(faq.searchForAgent).toHaveBeenCalledTimes(1);
    expect(rag.searchWithStatus).toHaveBeenCalledWith('핀토스에서 가상 메모리를 준비하는 법은?', 4, [faqResult]);
    expect(llm.answer.mock.calls[0][1]).toEqual([expect.objectContaining({ title: faqResult.title })]);
    expect(response.references).toEqual([faqResult]);
    expect(response.agentState.trustedInternalEvidence).toBe(true);
    expect(repository.save).toHaveBeenCalledTimes(1);
    expect(github.analyze).not.toHaveBeenCalled();
    expect(webSearch.search).not.toHaveBeenCalled();
  });

  it('FAQ 조회 장애를 웹 검색으로 감추지 않는다', async () => {
    const faq = { searchForAgent: jest.fn(async () => { throw new Error('db unavailable'); }) };
    const rag = { searchWithStatus: jest.fn() };
    const llm = { answer: jest.fn() };
    const webSearch = { search: jest.fn() };
    const service = new AgentService(questions() as never, rag as never, faq as never, {} as never, llm as never, webSearch as never);

    const response = await service.ask({ id: 'user-1' } as never, { question: '정글 일정은?' });

    expect(response.retrievalStatus).toBe('SEARCH_DEGRADED');
    expect(response.answer).toContain('근거 검색 서비스');
    expect(rag.searchWithStatus).not.toHaveBeenCalled();
    expect(webSearch.search).not.toHaveBeenCalled();
    expect(llm.answer).not.toHaveBeenCalled();
  });

  it('GitHub 키워드만 있고 저장소 URL이 없으면 분석이나 LLM 호출 없이 주소를 요청한다', async () => {
    const repository = questions();
    const github = { analyze: jest.fn() };
    const llm = { answer: jest.fn() };
    const service = new AgentService(repository as never, {} as never, {} as never, github as never, llm as never, {} as never);

    const response = await service.ask({ id: 'user-1' } as never, { question: '깃허브로 공부하는 법을 알려줘' });

    expect(response.agentRoute).toBe(AgentRoute.GITHUB_REPO);
    expect(response.answer).toContain('GitHub 저장소 URL');
    expect(response.references).toEqual([]);
    expect(github.analyze).not.toHaveBeenCalled();
    expect(llm.answer).not.toHaveBeenCalled();
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('질문에 있는 GitHub URL만 정규화해 분석기에 전달한다', async () => {
    const repository = questions();
    const github = { analyze: jest.fn(async () => ({ repositoryUrl: 'https://github.com/jungle/example', owner: 'jungle', repo: 'example', summary: '학습 저장소', fallback: false })) };
    const llm = { answer: jest.fn(async (_question: string, _contexts: { sourceUrl?: string }[]) => '학습 저장소입니다. [1]') };
    const service = new AgentService(repository as never, {} as never, {} as never, github as never, llm as never, {} as never);

    const response = await service.ask({ id: 'user-1' } as never, { question: 'https://github.com/jungle/example.git 구조를 알려줘' });

    expect(github.analyze).toHaveBeenCalledWith('https://github.com/jungle/example');
    expect(llm.answer.mock.calls[0][1]).toEqual([expect.objectContaining({ sourceUrl: 'https://github.com/jungle/example' })]);
    expect(response.id).toBeNull();
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('검색 장애 상태에서는 LLM 답변과 외부 검색을 실행하지 않는다', async () => {
    const questions = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ ...value, id: 'question-1', isPublic: false, createdAt: new Date() })),
    };
    const rag = { searchWithStatus: jest.fn(async () => ({ results: [{ chunkId: 'chunk-1' }], status: 'SEARCH_DEGRADED' })) };
    const llm = { answer: jest.fn() };
    const webSearch = { search: jest.fn() };
    const service = new AgentService(questions as never, rag as never, emptyFaq as never, {} as never, llm as never, webSearch as never);

    const response = await service.ask({ id: 'user-1' } as never, { question: '정글 지원 일정 알려줘' });

    expect(response.retrievalStatus).toBe('SEARCH_DEGRADED');
    expect(response).toMatchObject({ answerStatus: 'INTERNAL_SEARCH_FAILED' });
    expect(response.references).toEqual([]);
    expect(response.answer).toContain('일시적인 문제');
    expect(llm.answer).not.toHaveBeenCalled();
    expect(webSearch.search).not.toHaveBeenCalled();
    expect(response.id).toBeNull();
    expect(questions.save).not.toHaveBeenCalled();
  });

  it('활성 색인이 없을 때도 LLM 답변과 외부 검색을 실행하지 않는다', async () => {
    const questions = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ ...value, id: 'question-2', isPublic: false, createdAt: new Date() })),
    };
    const rag = { searchWithStatus: jest.fn(async () => ({ results: [], status: 'NO_ACTIVE_INDEX' })) };
    const llm = { answer: jest.fn() };
    const webSearch = { search: jest.fn() };
    const service = new AgentService(questions as never, rag as never, emptyFaq as never, {} as never, llm as never, webSearch as never);

    const response = await service.ask({ id: 'user-1' } as never, { question: '정글 지원 일정 알려줘' });

    expect(response.retrievalStatus).toBe('NO_ACTIVE_INDEX');
    expect(response).toMatchObject({ answerStatus: 'NO_ACTIVE_INDEX' });
    expect(response.answer).toContain('활성 지식 색인');
    expect(llm.answer).not.toHaveBeenCalled();
    expect(webSearch.search).not.toHaveBeenCalled();
    expect(response.id).toBeNull();
    expect(questions.save).not.toHaveBeenCalled();
  });
});
