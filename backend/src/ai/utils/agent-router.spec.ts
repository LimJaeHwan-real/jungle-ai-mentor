import { AgentRoute } from '../entities/ai-question.entity';
import { classifyQuestion } from './agent-router';

describe('classifyQuestion', () => {
  it('routes repository questions to GitHub MCP', () => {
    expect(classifyQuestion('이 저장소 구조 분석해줘', 'https://github.com/example/repo')).toBe(AgentRoute.GITHUB_REPO);
  });

  it('routes FAQ questions to FAQ search', () => {
    expect(classifyQuestion('자주 묻는 질문에서 찾아줘')).toBe(AgentRoute.FAQ_SEARCH);
  });

  it('routes jungle learning questions to RAG', () => {
    expect(classifyQuestion('정글 알고리즘 학습 방법 알려줘')).toBe(AgentRoute.JUNGLE_KNOWLEDGE);
  });

  it('routes Krafton Jungle questions to RAG', () => {
    expect(classifyQuestion('크래프톤 Jungle 지원 후기를 알려줘')).toBe(AgentRoute.JUNGLE_KNOWLEDGE);
  });
});
