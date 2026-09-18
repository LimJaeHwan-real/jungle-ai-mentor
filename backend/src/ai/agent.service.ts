import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { AskAiDto } from './dto/ask-ai.dto';
import { AgentRoute, AiQuestion } from './entities/ai-question.entity';
import { FaqService } from './faq.service';
import { GithubAnalysisResult, GithubMcpService } from './github-mcp.service';
import { LlmService } from './llm.service';
import { RagSearchResult, RagService } from './rag.service';
import { WebSearchService } from './web-search.service';
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
    private readonly webSearch: WebSearchService,
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
    let containsExternalMaterial = false;

    if (route === AgentRoute.GITHUB_REPO) {
      usedTools.push('GITHUB_MCP_TOOL');
      containsExternalMaterial = true;
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
      const retrieval = await this.rag.searchWithStatus(dto.question);
      const results = retrieval.results;
      let externalAugmentationStatus: 'NOT_REQUESTED' | 'SEARCHED_NOT_USED' | 'EVIDENCE_USED' | 'FAILED' = 'NOT_REQUESTED';
      state.ragFirst = {
        resultCount: results.length,
        topScore: results[0]?.score,
        status: retrieval.status,
      };
      if (dto.autoBlogSearch === true && retrieval.status === 'INSUFFICIENT_EVIDENCE') {
        usedTools.push('WEB_SEARCH_TOOL');
        const webResult = await this.webSearch.search(dto.question).catch(() => undefined);
        if (webResult === undefined) {
          externalAugmentationStatus = 'FAILED';
          state.webSearch = { reason: 'external_search_failed' };
        } else if (webResult === null) {
          externalAugmentationStatus = 'SEARCHED_NOT_USED';
          state.webSearch = { reason: 'no_cited_blog' };
        } else {
          externalAugmentationStatus = 'EVIDENCE_USED';
          state.webSearch = { resultCount: webResult.references.length };
          answer = webResult.answer;
          references = webResult.references;
          containsExternalMaterial = true;
        }
      }

      state.externalAugmentationStatus = externalAugmentationStatus;
      state.retrievalStatus = retrieval.status;
      if (retrieval.status === 'SEARCH_DEGRADED' || retrieval.status === 'NO_ACTIVE_INDEX') {
        references = [];
        state.ragUnavailable = {
          resultCount: results.length,
          status: retrieval.status,
          action: retrieval.status === 'SEARCH_DEGRADED' ? 'answer_generation_skipped' : 'reindex_required',
        };
        answer = retrieval.status === 'SEARCH_DEGRADED'
          ? '현재 근거 검색 서비스에 일시적인 문제가 있어 신뢰할 수 있는 답변을 만들지 않았습니다. 잠시 후 다시 시도해 주세요.'
          : '현재 질문에 사용할 활성 지식 색인이 없습니다. 운영자가 문서를 색인하거나 재색인한 뒤 다시 시도해 주세요.';
      } else if (retrieval.status === 'INSUFFICIENT_EVIDENCE' && externalAugmentationStatus !== 'EVIDENCE_USED') {
        references = [];
        answer = externalAugmentationStatus === 'FAILED'
          ? '외부 블로그 검색에 실패했고 등록된 근거에서도 충분한 내용을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.'
          : externalAugmentationStatus === 'SEARCHED_NOT_USED'
            ? '등록된 근거가 부족하고 인용할 수 있는 블로그 후기도 찾지 못했습니다. 질문을 더 구체적으로 해 주세요.'
            : '등록된 근거에서 질문에 답할 만큼 충분한 내용을 확인하지 못했습니다. 질문을 더 구체적으로 하거나 자료가 추가된 뒤 다시 시도해 주세요.';
      } else if (retrieval.status === 'SUFFICIENT_EVIDENCE') {
        references = results;
        const githubAnalyses = await this.analyzeGithubUrlsFromRagResults(results);
        if (githubAnalyses.length > 0) {
          containsExternalMaterial = true;
          usedTools.push('GITHUB_MCP_TOOL');
          state.githubFromRag = {
            repositoryCount: githubAnalyses.length,
            repositories: githubAnalyses.map((analysis) => analysis.repositoryUrl),
            fallbackCount: githubAnalyses.filter((analysis) => analysis.fallback).length,
          };
          references = [...references, ...githubAnalyses];
        }

        answer = await this.llm.answer(
          dto.question,
          [
            ...results.map((result) => ({
              title: result.title,
              content: result.chunkText,
              category: result.category,
              sourceUrl: result.sourceUrl,
              chunkId: result.chunkId,
              sectionPath: result.sectionPath,
              sourceStart: result.sourceStart,
              sourceEnd: result.sourceEnd,
            })),
            ...githubAnalyses.map((analysis) => ({
              title: `GitHub repository: ${analysis.owner}/${analysis.repo}`,
              content: this.formatGithubAnalysis(analysis),
              category: 'GITHUB_REPOSITORY',
              sourceUrl: analysis.repositoryUrl,
            })),
          ],
          '제공된 근거에 있는 내용만 답변하고, 핵심 주장마다 해당 근거 번호 [1], [2]를 표시하세요. 근거 안에 GitHub 저장소 분석 정보가 있으면 저장소 소개와 README 요약을 설명할 수 있습니다. 근거가 부족한 부분은 단정하지 마세요.',
        );
        const citedNumbers = [...answer.matchAll(/\[(\d+)\]/g)].map((match) => Number(match[1]));
        if (citedNumbers.length === 0 || citedNumbers.some((number) => number < 1 || number > references.length)) {
          state.answerCitationStatus = 'MISSING_OR_INVALID';
          answer = '근거 번호를 확인할 수 있는 답변을 만들지 못했습니다. 잠시 후 다시 질문해 주세요.';
        } else {
          state.answerCitationStatus = 'CITATION_IDS_VALID';
        }
      }
    } else {
      usedTools.push('GENERAL_LLM_TOOL');
      answer = await this.llm.answer(dto.question);
    }

    const completedState: Record<string, unknown> = { ...state, finishedAt: new Date().toISOString() };
    if (containsExternalMaterial) {
      return {
        id: null,
        question: dto.question,
        answer,
        usedTools,
        agentRoute: route,
        agentState: completedState,
        retrievalStatus: completedState.retrievalStatus,
        externalAugmentationStatus: completedState.externalAugmentationStatus,
        references,
        isPublic: false,
        createdAt: new Date(),
      };
    }

    const question = await this.questions.save(
      this.questions.create({
        userId: user.id,
        question: dto.question,
        answer,
        usedTools,
        agentRoute: route,
        agentState: completedState,
      }),
    );

    return {
      id: question.id,
      question: question.question,
      answer: question.answer,
      usedTools: question.usedTools,
      agentRoute: question.agentRoute,
      agentState: question.agentState,
      retrievalStatus: question.agentState.retrievalStatus,
      externalAugmentationStatus: question.agentState.externalAugmentationStatus,
      references,
      isPublic: question.isPublic,
      createdAt: question.createdAt,
    };
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
    ]
      .filter(Boolean)
      .join('\n');
  }
}
