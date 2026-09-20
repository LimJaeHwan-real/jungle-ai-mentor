import { AgentRoute } from '../entities/ai-question.entity';
import { extractGithubRepositoryUrls } from './github-url';

export function classifyQuestion(question: string, repositoryUrl?: string): AgentRoute {
  if (extractGithubRepositoryUrls(`${question} ${repositoryUrl ?? ''}`, 1).length > 0) {
    return AgentRoute.GITHUB_REPO;
  }

  const withoutUrls = question.replace(/https?:\/\/\S+/gi, ' ');
  if (/(?<![a-z0-9_-])(?:github|repo|repository)(?![a-z0-9_-])/i.test(withoutUrls)
    || withoutUrls.includes('깃허브')) {
    return AgentRoute.GITHUB_REPO;
  }

  return AgentRoute.GENERAL;
}
