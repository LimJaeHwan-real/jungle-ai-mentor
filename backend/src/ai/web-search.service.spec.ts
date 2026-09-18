import { WebSearchService } from './web-search.service';

const config = (key = 'test-placeholder') => ({
  get: (name: string) => name === 'OPENAI_API_KEY' ? key : undefined,
});
const metrics = { recordWebSearchResult: jest.fn() };

const searchedResponse = (text: string, annotations: unknown[]) => ({
  ok: true,
  json: async () => ({
    status: 'completed',
    output: [
      { type: 'web_search_call', status: 'completed', action: { type: 'search' } },
      { type: 'message', content: [{ type: 'output_text', text, annotations }] },
    ],
  }),
} as Response);

describe('WebSearchService 일회성 블로그 검색', () => {
  beforeEach(() => metrics.recordWebSearchResult.mockClear());
  afterEach(() => jest.restoreAllMocks());

  it('검색을 강제로 한 번 실행하고 실제 인용된 출처만 반환한다', async () => {
    const request = jest.spyOn(global, 'fetch').mockResolvedValue(searchedResponse('정글 후기가 있습니다. [1]', [
      { type: 'url_citation', start_index: 12, end_index: 15, url: 'https://example.tistory.com/123', title: '정글 후기' },
      { type: 'url_citation', start_index: 12, end_index: 15, url: 'https://example.com/other', title: '다른 자료' },
    ]));
    const service = new WebSearchService(config() as never, metrics as never);

    await expect(service.search('크래프톤 정글 생활은 어떤가요?')).resolves.toEqual({
      answer: '정글 후기가 있습니다. [1]',
      references: [
        { type: 'WEB_SEARCH', title: '정글 후기', sourceUrl: 'https://example.tistory.com/123', startIndex: 12, endIndex: 15 },
        { type: 'WEB_SEARCH', title: '다른 자료', sourceUrl: 'https://example.com/other', startIndex: 12, endIndex: 15 },
      ],
    });

    expect(request).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(request.mock.calls[0][1]?.body));
    expect(body.model).toBe('gpt-5.6-luna');
    expect(body.tools).toEqual([{ type: 'web_search', search_context_size: 'medium' }]);
    expect(body.tool_choice).toBe('required');
    expect(body.store).toBe(false);
    expect(body.max_output_tokens).toBe(2000);
    expect(body.input).toContain('크래프톤 정글 생활은 어떤가요?');
    expect(body.input).toContain('크래프톤 정글');
    expect(request.mock.calls[0][1]?.signal).toBeDefined();
    expect(metrics.recordWebSearchResult).toHaveBeenCalledWith('used', expect.any(Number));
  });

  it('최근 후기에서는 질문 속 두 대상을 검색에 사용하고 고정 정글어를 붙이지 않는다', async () => {
    const request = jest.spyOn(global, 'fetch').mockResolvedValue(searchedResponse('면접 후기입니다. [1]', [
      { type: 'url_citation', start_index: 10, end_index: 13, url: 'https://example.tistory.com/review', title: '면접 후기' },
    ]));
    const service = new WebSearchService(config() as never, metrics as never);

    await expect(service.search('게임랩, 게임 테크랩 최근 면접 후기 내용을 요약해줘', 'RECENT_REVIEW')).resolves.toMatchObject({
      references: [{ sourceUrl: 'https://example.tistory.com/review' }],
    });
    const body = JSON.parse(String(request.mock.calls[0][1]?.body));
    expect(body.input).toContain('게임랩, 게임 테크랩 최근 면접 후기 내용을 요약해줘');
    expect(body.input).toContain('각 대상');
    expect(body.input).toContain('작성 날짜');
    expect(body.input).not.toContain('크래프톤 정글');
  });

  it('공식 사실 질문은 질문 속 주제의 원문을 우선 검색하고 일반 출처도 인용할 수 있다', async () => {
    const request = jest.spyOn(global, 'fetch').mockResolvedValue(searchedResponse('모집 일정은 공지에 있습니다. [1]', [
      { type: 'url_citation', start_index: 16, end_index: 19, url: 'https://jungle.krafton.com/news/announcement', title: '공지사항' },
    ]));
    const service = new WebSearchService(config() as never, metrics as never);

    await expect(service.search('다음 기수 공식 지원 마감일은 언제인가요?', 'OFFICIAL_FACT')).resolves.toMatchObject({
      references: [{ sourceUrl: 'https://jungle.krafton.com/news/announcement' }],
    });
    const body = JSON.parse(String(request.mock.calls[0][1]?.body));
    expect(body.input).toContain('공식 원문');
    expect(body.input).toContain('다음 기수 공식 지원 마감일은 언제인가요?');
  });

  it('블로그 인용이 없거나 검색 호출이 없으면 웹 답변을 채택하지 않는다', async () => {
    const request = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(searchedResponse('출처 없는 답변입니다.', []))
      .mockResolvedValueOnce(searchedResponse('답변 [1]', [{ type: 'url_citation', start_index: 3, end_index: 6, url: 'https://example.com/post', title: '일반 사이트' }]));
    const service = new WebSearchService(config() as never, metrics as never);

    await expect(service.search('정글 후기')).resolves.toBeNull();
    await expect(service.search('정글 후기')).resolves.toBeNull();
    expect(request).toHaveBeenCalledTimes(2);
    expect(metrics.recordWebSearchResult).toHaveBeenCalledTimes(2);
    expect(metrics.recordWebSearchResult).toHaveBeenLastCalledWith('noCitedSource', expect.any(Number));
  });

  it('검색이 정상 완료돼도 답할 근거가 없다는 결과는 인용 링크가 있어도 채택하지 않는다', async () => {
    const answer = 'NO_SUPPORTED_ANSWER';
    const request = jest.spyOn(global, 'fetch').mockResolvedValue(searchedResponse(answer, [
      { type: 'url_citation', start_index: 0, end_index: answer.length, url: 'https://example.org/post', title: '관련 없는 글' },
    ]));
    const service = new WebSearchService(config() as never, metrics as never);

    await expect(service.search('다음 기수 공식 마감일은?', 'OFFICIAL_FACT')).resolves.toBeNull();
    const body = JSON.parse(String(request.mock.calls[0][1]?.body));
    expect(body.input).toContain('NO_SUPPORTED_ANSWER');
    expect(metrics.recordWebSearchResult).toHaveBeenCalledWith('noCitedSource', expect.any(Number));
  });

  it('API 오류에는 재시도하거나 임의의 답변을 만들지 않는다', async () => {
    const request = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 500 } as Response);
    const service = new WebSearchService(config() as never, metrics as never);

    await expect(service.search('정글 후기')).rejects.toThrow('웹 검색');
    expect(request).toHaveBeenCalledTimes(1);
    expect(metrics.recordWebSearchResult).toHaveBeenCalledWith('failed', expect.any(Number));
  });

  it('검색 도구를 실행하지 않은 불완전한 응답은 호출 실패로 기록한다', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'incomplete', output: [{ type: 'message', content: [{ type: 'output_text', text: '인용 없는 답변' }] }] }),
    } as Response);
    const service = new WebSearchService(config() as never, metrics as never);

    await expect(service.search('정글 후기')).rejects.toThrow('웹 검색');
    expect(metrics.recordWebSearchResult).toHaveBeenCalledWith('failed', expect.any(Number));
  });

  it('답변 앞 공백이 있어도 인용 위치를 원문 기준으로 유지한다', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(searchedResponse('  후기 [1]', [
      { type: 'url_citation', start_index: 5, end_index: 8, url: 'https://example.tistory.com/1', title: '후기' },
    ]));
    const service = new WebSearchService(config() as never, metrics as never);

    await expect(service.search('정글 후기')).resolves.toMatchObject({
      answer: '  후기 [1]',
      references: [{ startIndex: 5, endIndex: 8 }],
    });
  });

  it('20초 안에 끝나지 않는 요청을 중단하고 재시도하지 않는다', async () => {
    jest.useFakeTimers();
    const request = jest.spyOn(global, 'fetch').mockImplementation((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
    }));
    try {
      const service = new WebSearchService(config() as never, metrics as never);
      const pending = service.search('정글 후기');
      const failure = expect(pending).rejects.toThrow('웹 검색');

      await jest.advanceTimersByTimeAsync(20_000);
      await failure;
      expect(request).toHaveBeenCalledTimes(1);
      expect(metrics.recordWebSearchResult).toHaveBeenCalledWith('failed', expect.any(Number));
    } finally {
      jest.useRealTimers();
    }
  });

  it('API 키가 없으면 외부 호출을 하지 않는다', async () => {
    const request = jest.spyOn(global, 'fetch');
    const service = new WebSearchService(config('') as never, metrics as never);

    await expect(service.search('정글 후기')).rejects.toThrow('웹 검색');
    expect(request).not.toHaveBeenCalled();
    expect(metrics.recordWebSearchResult).toHaveBeenCalledWith('failed', expect.any(Number));
  });
});
