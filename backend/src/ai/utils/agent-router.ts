import { AgentRoute } from '../entities/ai-question.entity';

export function classifyQuestion(question: string, repositoryUrl?: string): AgentRoute {
  const normalized = `${question} ${repositoryUrl ?? ''}`.toLowerCase();

  if (repositoryUrl || normalized.includes('github') || normalized.includes('repo') || normalized.includes('repository')) {
    return AgentRoute.GITHUB_REPO;
  }

  if (normalized.includes('faq') || normalized.includes('자주') || normalized.includes('공개 답변')) {
    return AgentRoute.FAQ_SEARCH;
  }

  return AgentRoute.GENERAL;
}
