import { AgentRoute } from '../entities/ai-question.entity';
import { classifyQuestion } from './agent-router';

describe('classifyQuestion', () => {
  it('routes repository questions to GitHub MCP', () => {
    expect(classifyQuestion('이 저장소 구조 분석해줘', 'https://github.com/example/repo')).toBe(AgentRoute.GITHUB_REPO);
  });

  it('routes FAQ wording through GENERAL so FAQs can be internal evidence', () => {
    expect(classifyQuestion('자주 묻는 질문에서 찾아줘')).toBe(AgentRoute.GENERAL);
  });

  it.each(['깃허브 저장소를 분석해줘', 'GITHUB 저장소를 분석해줘', 'repo를 분석해줘', 'repository를 분석해줘'])(
    'routes an explicit GitHub keyword to GITHUB_REPO: %s',
    (question) => expect(classifyQuestion(question)).toBe(AgentRoute.GITHUB_REPO),
  );

  it.each(['repository-like 글을 찾아줘', 'myrepo 자료 알려줘', 'https://example.com/owner/repo 분석해줘'])(
    'does not mistake a substring or non-GitHub URL for a repository: %s',
    (question) => expect(classifyQuestion(question)).toBe(AgentRoute.GENERAL),
  );

  it('does not treat an invalid repositoryUrl field as a GitHub repository', () => {
    expect(classifyQuestion('학습 방법 알려줘', 'https://example.com/owner/repo')).toBe(AgentRoute.GENERAL);
  });

  it('routes jungle learning questions to GENERAL', () => {
    expect(classifyQuestion('정글 알고리즘 학습 방법 알려줘')).toBe(AgentRoute.GENERAL);
  });

  it('routes Krafton Jungle questions to GENERAL', () => {
    expect(classifyQuestion('크래프톤 Jungle 지원 후기를 알려줘')).toBe(AgentRoute.GENERAL);
  });

  it('routes unrelated review questions to GENERAL', () => {
    expect(classifyQuestion('게임랩, 게임 테크랩 최근 면접 후기를 알려줘')).toBe(AgentRoute.GENERAL);
  });
});
