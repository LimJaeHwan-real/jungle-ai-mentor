import { extractGithubRepositoryUrls } from './github-url';

describe('extractGithubRepositoryUrls', () => {
  it('finds the same URL on repeated calls even when each call stops at its limit', () => {
    const question = 'https://github.com/jungle/example 와 https://github.com/other/project 저장소를 비교해줘';

    expect(extractGithubRepositoryUrls(question, 1)).toEqual(['https://github.com/jungle/example']);
    expect(extractGithubRepositoryUrls(question, 1)).toEqual(['https://github.com/jungle/example']);
  });

  it('rejects URLs whose repository segment continues with an invalid character', () => {
    expect(extractGithubRepositoryUrls('https://github.com/owner/repo@other.example')).toEqual([]);
    expect(extractGithubRepositoryUrls('https://github.com.evil.example/owner/repo')).toEqual([]);
  });

  it('문장 속 쉼표와 한국어 조사가 붙은 유효한 저장소 URL을 추출한다', () => {
    expect(extractGithubRepositoryUrls('https://github.com/owner/repo, 구조를 분석해줘')).toEqual(['https://github.com/owner/repo']);
    expect(extractGithubRepositoryUrls('https://github.com/owner/repo를 분석해줘')).toEqual(['https://github.com/owner/repo']);
    expect(extractGithubRepositoryUrls('https://github.com/owner/repo.')).toEqual(['https://github.com/owner/repo']);
  });
});
