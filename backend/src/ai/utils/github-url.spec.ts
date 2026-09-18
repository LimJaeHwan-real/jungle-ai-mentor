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
});
