import { AgentRoute } from '../entities/ai-question.entity';

export function classifyQuestion(question: string, repositoryUrl?: string): AgentRoute {
  const normalized = `${question} ${repositoryUrl ?? ''}`.toLowerCase();

  if (repositoryUrl || normalized.includes('github') || normalized.includes('repo') || normalized.includes('repository')) {
    return AgentRoute.GITHUB_REPO;
  }

  if (normalized.includes('faq') || normalized.includes('자주') || normalized.includes('공개 답변')) {
    return AgentRoute.FAQ_SEARCH;
  }

  if (
    normalized.includes('크래프톤') ||
    normalized.includes('krafton') ||
    normalized.includes('jungle') ||
    normalized.includes('정글') ||
    normalized.includes('학습') ||
    normalized.includes('알고리즘') ||
    normalized.includes('입학') ||
    normalized.includes('상담') ||
    normalized.includes('핀토스') ||
    normalized.includes('부트캠프')
  ) {
    return AgentRoute.JUNGLE_KNOWLEDGE;
  }

  return AgentRoute.GENERAL;
}
