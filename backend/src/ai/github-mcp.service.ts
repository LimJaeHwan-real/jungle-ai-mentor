import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface GithubAnalysisResult {
  mode: string;
  repositoryUrl: string;
  owner?: string;
  repo?: string;
  summary: string;
  readmePreview?: string;
  fileHints: string[];
  fallback: boolean;
}

@Injectable()
export class GithubMcpService {
  constructor(private readonly config: ConfigService) {}

  async analyze(repositoryUrl: string): Promise<GithubAnalysisResult> {
    const mode = this.config.get<string>('MCP_GITHUB_MODE') ?? 'mock';
    const parsed = this.parseRepositoryUrl(repositoryUrl);

    if (!parsed) {
      return this.mock(repositoryUrl, 'GitHub repository URL을 파싱할 수 없어 fallback 분석을 반환했습니다.');
    }

    if (mode === 'github_api') {
      return this.githubApi(repositoryUrl, parsed.owner, parsed.repo);
    }

    if (mode === 'mcp_stdio') {
      return this.mock(
        repositoryUrl,
        'mcp_stdio 모드는 인터페이스만 준비되어 있습니다. 현재 데모에서는 안전하게 mock adapter로 fallback합니다.',
        parsed.owner,
        parsed.repo,
      );
    }

    return this.mock(repositoryUrl, 'MCP_GITHUB_MODE=mock 설정으로 데모 분석을 반환했습니다.', parsed.owner, parsed.repo);
  }

  private async githubApi(repositoryUrl: string, owner: string, repo: string): Promise<GithubAnalysisResult> {
    const token = this.config.get<string>('GITHUB_TOKEN');
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'jungle-ai-mentor',
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    try {
      const [repoResponse, readmeResponse, contentsResponse] = await Promise.all([
        fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers }),
        fetch(`https://api.github.com/repos/${owner}/${repo}/readme`, { headers }),
        fetch(`https://api.github.com/repos/${owner}/${repo}/contents`, { headers }),
      ]);

      if (!repoResponse.ok) {
        return this.mock(repositoryUrl, `GitHub API 응답 실패(${repoResponse.status})로 fallback했습니다.`, owner, repo);
      }

      const repoData = (await repoResponse.json()) as { description?: string; language?: string; stargazers_count?: number };
      const readmeData = readmeResponse.ok
        ? ((await readmeResponse.json()) as { content?: string; encoding?: string })
        : undefined;
      const contentsData = contentsResponse.ok
        ? ((await contentsResponse.json()) as Array<{ name: string; type: string }>)
        : [];

      const readmePreview =
        readmeData?.content && readmeData.encoding === 'base64'
          ? Buffer.from(readmeData.content, 'base64').toString('utf8').slice(0, 1200)
          : undefined;

      return {
        mode: 'github_api',
        repositoryUrl,
        owner,
        repo,
        summary: [
          repoData.description ?? '설명이 없는 저장소입니다.',
          repoData.language ? `주요 언어: ${repoData.language}` : '',
          typeof repoData.stargazers_count === 'number' ? `Stars: ${repoData.stargazers_count}` : '',
        ]
          .filter(Boolean)
          .join(' / '),
        readmePreview,
        fileHints: contentsData.slice(0, 12).map((item) => `${item.type}:${item.name}`),
        fallback: false,
      };
    } catch {
      return this.mock(repositoryUrl, 'GitHub API 호출 중 오류가 발생해 fallback했습니다.', owner, repo);
    }
  }

  private mock(repositoryUrl: string, reason: string, owner?: string, repo?: string): GithubAnalysisResult {
    return {
      mode: 'mock',
      repositoryUrl,
      owner,
      repo,
      summary: reason,
      readmePreview:
        'Mock README: 이 저장소는 README, src 디렉터리, 테스트 파일을 기준으로 구조를 분석하는 데모 응답을 제공합니다.',
      fileHints: ['dir:src', 'file:README.md', 'file:package.json', 'dir:test'],
      fallback: true,
    };
  }

  private parseRepositoryUrl(repositoryUrl: string) {
    try {
      const url = new URL(repositoryUrl);
      const [owner, repoWithSuffix] = url.pathname.replace(/^\/+/, '').split('/');
      const repo = repoWithSuffix?.replace(/\.git$/, '');
      if (!owner || !repo) return undefined;
      return { owner, repo };
    } catch {
      return undefined;
    }
  }
}

