import { LlmService } from './llm.service';

describe('LlmService 근거 출처 전달', () => {
  afterEach(() => jest.restoreAllMocks());

  it('LLM에 전달하는 근거 번호에 chunk 식별자와 원문 위치를 연결한다', async () => {
    const request = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '팀 프로젝트가 포함됩니다. [1]' } }] }),
    } as Response);
    const service = new LlmService({ get: (name: string) => name === 'OPENAI_API_KEY' ? 'test-placeholder' : undefined } as never);

    await service.answer('팀 프로젝트가 있나요?', [{
      title: '정글 후기',
      content: '팀 프로젝트를 진행했습니다.',
      sourceUrl: 'https://example.com/post',
      chunkId: 'chunk-1',
      sectionPath: '과정 > 프로젝트',
      sourceStart: 15,
      sourceEnd: 30,
    }]);

    const body = JSON.parse(String(request.mock.calls[0][1]?.body));
    const context = body.messages[1].content as string;
    expect(context).toContain('[1] 정글 후기');
    expect(context).toContain('chunk ID: chunk-1');
    expect(context).toContain('섹션: 과정 > 프로젝트');
    expect(context).toContain('원문 범위: 15-30');
    expect(body.messages[0].content).toContain('근거 번호');
  });
});
