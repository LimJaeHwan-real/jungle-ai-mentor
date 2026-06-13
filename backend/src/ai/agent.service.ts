import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { BlogSearchService } from './blog-search.service';
import { AskAiDto } from './dto/ask-ai.dto';
import { AgentRoute, AiQuestion } from './entities/ai-question.entity';
import { FaqService } from './faq.service';
import { GithubAnalysisResult, GithubMcpService } from './github-mcp.service';
import { LlmService } from './llm.service';
import { RagSearchResult, RagService } from './rag.service';
import { classifyQuestion } from './utils/agent-router';
import { extractGithubRepositoryUrls } from './utils/github-url';

@Injectable()
export class AgentService {
  constructor(
    @InjectRepository(AiQuestion) private readonly questions: Repository<AiQuestion>,
    private readonly rag: RagService,
    private readonly faq: FaqService,
    private readonly github: GithubMcpService,
    private readonly llm: LlmService,
    private readonly blogSearch: BlogSearchService,
  ) {}

  async ask(user: User, dto: AskAiDto) {
    const route = classifyQuestion(dto.question, dto.repositoryUrl);
    const state: Record<string, unknown> = {
      route,
      maxToolIterations: 3,
      startedAt: new Date().toISOString(),
    };
    const usedTools: string[] = [];
    let answer = '';
    let references: unknown[] = [];

    if (route === AgentRoute.GITHUB_REPO) {
      usedTools.push('GITHUB_MCP_TOOL');
      const analysis = await this.github.analyze(dto.repositoryUrl ?? dto.question);
      references = [analysis];
      state.githubFallback = analysis.fallback;
      answer = await this.llm.answer(dto.question, [], `GitHub 분석 결과: ${JSON.stringify(analysis)}`);
    } else if (route === AgentRoute.FAQ_SEARCH) {
      usedTools.push('FAQ_SEARCH_TOOL');
      const faqs = await this.faq.searchForAgent(dto.question);
      references = faqs;
      answer = await this.llm.answer(dto.question, faqs, '공개 FAQ를 우선 참고해서 답변하세요.');
    } else if (route === AgentRoute.JUNGLE_KNOWLEDGE) {
      usedTools.push('RAG_SEARCH_TOOL');
      let results = await this.rag.search(dto.question);
      references = results;
      state.ragFirst = {
        resultCount: results.length,
        topScore: results[0]?.score,
      };

      if (dto.autoBlogSearch !== false && this.shouldUseRealtimeBlogFallback(results)) {
        usedTools.push('BLOG_SEARCH_TOOL');
        const blogSearch = await this.blogSearch.discoverAndImport(dto.question);
        state.blogSearch = {
          mode: blogSearch.mode,
          query: blogSearch.query,
          importedCount: blogSearch.importedCount,
          resultCount: blogSearch.references.length,
          reason: 'rag_results_insufficient',
        };
        results = await this.rag.search(dto.question, 6);
        references = [...blogSearch.references, ...results];
      }

      const githubAnalyses = await this.analyzeGithubUrlsFromRagResults(results);
      if (githubAnalyses.length > 0) {
        usedTools.push('GITHUB_MCP_TOOL');
        state.githubFromRag = {
          repositoryCount: githubAnalyses.length,
          repositories: githubAnalyses.map((analysis) => analysis.repositoryUrl),
          fallbackCount: githubAnalyses.filter((analysis) => analysis.fallback).length,
        };
        references = [...githubAnalyses, ...references];
      }

      answer = await this.llm.answer(
        dto.question,
        [
          ...results.map((result) => ({
            title: result.title,
            content: result.chunkText,
            category: result.category,
            sourceUrl: result.sourceUrl,
          })),
          ...githubAnalyses.map((analysis) => ({
            title: `GitHub repository: ${analysis.owner}/${analysis.repo}`,
            content: this.formatGithubAnalysis(analysis),
            category: 'GITHUB_REPOSITORY',
            sourceUrl: analysis.repositoryUrl,
          })),
        ],
        '정글 학습 자료와 자동 수집된 블로그 문서 chunk를 근거로 답변하세요. 근거 안에 GitHub 저장소 분석 정보가 있으면 사용자가 URL을 직접 입력하지 않았더라도 해당 저장소의 목적, README 요약, 파일 힌트를 함께 설명하세요. 근거가 부족하면 부족하다고 말하세요.',
      );
    } else {
      usedTools.push('GENERAL_LLM_TOOL');
      answer = await this.llm.answer(dto.question);
    }

    const question = await this.questions.save(
      this.questions.create({
        userId: user.id,
        question: dto.question,
        answer,
        usedTools,
        agentRoute: route,
        agentState: {
          ...state,
          finishedAt: new Date().toISOString(),
        },
      }),
    );

    return {
      id: question.id,
      question: question.question,
      answer: question.answer,
      usedTools: question.usedTools,
      agentRoute: question.agentRoute,
      agentState: question.agentState,
      references,
      isPublic: question.isPublic,
      createdAt: question.createdAt,
    };
  }

  private shouldUseRealtimeBlogFallback(results: Array<{ score?: number }>) {
    if (results.length === 0) return true;
    const topScore = results[0]?.score ?? 0;
    return topScore < 0.05;
  }

  private async analyzeGithubUrlsFromRagResults(results: RagSearchResult[]) {
    const urls = [
      ...new Set(results.flatMap((result) => extractGithubRepositoryUrls(`${result.chunkText}\n${result.sourceUrl ?? ''}`, 3))),
    ].slice(0, 2);

    return Promise.all(urls.map((url) => this.github.analyze(url)));
  }

  private formatGithubAnalysis(analysis: GithubAnalysisResult) {
    return [
      analysis.summary,
      analysis.readmePreview ? `README preview: ${analysis.readmePreview}` : '',
      analysis.fileHints.length ? `Files: ${analysis.fileHints.join(', ')}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }
}
