import { GithubMcpService } from './github-mcp.service';

describe('GithubMcpService 외부 자료 범위', () => {
  it('저장소 소개와 README만 조회하고 파일 목록을 요청하지 않는다', async () => {
    const originalFetch = global.fetch;
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ description: '정글 학습 기록' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ content: Buffer.from('정글 README').toString('base64'), encoding: 'base64' }) });
    global.fetch = fetchMock as never;
    try {
      const service = new GithubMcpService({ get: (key: string) => key === 'MCP_GITHUB_MODE' ? 'github_api' : undefined } as never);
      const result = await service.analyze('https://github.com/example/jungle');

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
        'https://api.github.com/repos/example/jungle',
        'https://api.github.com/repos/example/jungle/readme',
      ]);
      expect(result.summary).toContain('정글 학습 기록');
      expect(result.readmePreview).toBe('정글 README');
      expect(result).not.toHaveProperty('fileHints');
    } finally {
      global.fetch = originalFetch;
    }
  });
});
