import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { AskAiDto } from './dto/ask-ai.dto';
import { AgentRoute, AiQuestion } from './entities/ai-question.entity';
import { FaqService } from './faq.service';
import { GithubAnalysisResult, GithubMcpService } from './github-mcp.service';
import { LlmService } from './llm.service';
import { RagSearchResponse, RagSearchResult, RagService } from './rag.service';
import { WebSearchService } from './web-search.service';
import { classifyQuestion } from './utils/agent-router';
import { extractGithubRepositoryUrls } from './utils/github-url';
import { classifySearchIntent } from './utils/search-intent';

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
    let shouldPersist = false;
    let answerStatus = '';

    if (route === AgentRoute.GITHUB_REPO) {
      const repositoryUrl = extractGithubRepositoryUrls(`${dto.repositoryUrl ?? ''} ${dto.question}`, 1)[0];
      if (!repositoryUrl) {
        state.githubUrlRequired = true;
        answerStatus = 'GITHUB_URL_REQUIRED';
        answer = '분석할 GitHub 저장소 URL을 알려주세요. 예: https://github.com/owner/repo';
      } else {
        usedTools.push('GITHUB_MCP_TOOL');
        const analysis = await this.github.analyze(repositoryUrl);
        state.githubFallback = analysis.fallback;
        if (analysis.fallback) {
          answer = 'GitHub 저장소 내용을 확인하지 못했습니다. 저장소 접근이나 GitHub 연동 설정을 확인한 뒤 다시 시도해 주세요.';
          answerStatus = 'GITHUB_ANALYSIS_FAILED';
        } else {
          try {
            answer = await this.llm.answer(dto.question, [{
              title: `GitHub repository: ${analysis.owner}/${analysis.repo}`,
              content: this.formatGithubAnalysis(analysis),
              category: 'GITHUB_REPOSITORY',
              sourceUrl: analysis.repositoryUrl,
            }], '제공된 GitHub 분석 결과만 사용하고, 확인되지 않은 내용은 단정하지 마세요.');
            references = [analysis];
            answerStatus = 'GITHUB_ANALYSIS';
          } catch {
            answer = 'GitHub 저장소 정보는 확인했지만 답변 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.';
            answerStatus = 'ANSWER_GENERATION_FAILED';
          }
        }
      }
    } else {
      usedTools.push('FAQ_SEARCH_TOOL');
      let faqCandidates: RagSearchResult[] = [];
      let retrieval: RagSearchResponse | undefined;
      try {
        faqCandidates = await this.faq.searchForAgent(dto.question);
      } catch {
        retrieval = { results: [], status: 'SEARCH_DEGRADED' };
      }
      const intent = classifySearchIntent(dto.question);
      state.searchIntent = intent;
      if (retrieval === undefined) {
        usedTools.push('RAG_SEARCH_TOOL');
        retrieval = await this.rag.searchWithStatus(dto.question, 4, faqCandidates);
      }
      const results = retrieval.results;
      let externalAugmentationStatus: 'NOT_REQUESTED' | 'SEARCHED_NOT_USED' | 'EVIDENCE_USED' | 'FAILED' = 'NOT_REQUESTED';
      state.ragFirst = {
        resultCount: results.length,
        topScore: results[0]?.score,
        status: retrieval.status,
      };
      if (retrieval.status === 'INSUFFICIENT_EVIDENCE') {
        usedTools.push('WEB_SEARCH_TOOL');
        const webResult = await this.webSearch.search(dto.question, intent).catch(() => undefined);
        if (webResult === undefined) {
          externalAugmentationStatus = 'FAILED';
          state.webSearch = { reason: 'external_search_failed' };
        } else if (webResult === null) {
          externalAugmentationStatus = 'SEARCHED_NOT_USED';
          state.webSearch = { reason: 'no_cited_source' };
        } else {
          externalAugmentationStatus = 'EVIDENCE_USED';
          state.webSearch = { resultCount: webResult.references.length };
          answer = webResult.answer;
          references = webResult.references;
          answerStatus = 'WEB_EVIDENCE';
        }
      }

      state.externalAugmentationStatus = externalAugmentationStatus;
      state.retrievalStatus = retrieval.status;
      if (retrieval.status === 'SEARCH_DEGRADED' || retrieval.status === 'NO_ACTIVE_INDEX') {
        references = [];
        answerStatus = retrieval.status === 'SEARCH_DEGRADED' ? 'INTERNAL_SEARCH_FAILED' : 'NO_ACTIVE_INDEX';
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
        answerStatus = externalAugmentationStatus === 'FAILED' ? 'WEB_SEARCH_FAILED' : 'NO_EVIDENCE';
        answer = externalAugmentationStatus === 'FAILED'
          ? '웹 검색에 실패했고 등록된 근거에서도 충분한 내용을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.'
          : '현재 연결된 내부 자료와 웹 검색에서 질문에 답할 만한 근거를 찾지 못했습니다. 질문을 더 구체적으로 적거나 참고할 링크를 알려주세요.';
      } else if (retrieval.status === 'SUFFICIENT_EVIDENCE' && externalAugmentationStatus !== 'EVIDENCE_USED') {
        references = results;
        try {
          answer = await this.llm.answer(
            dto.question,
            results.map((result) => ({
              title: result.title,
              content: result.chunkText,
              category: result.category,
              sourceUrl: result.sourceUrl,
              chunkId: result.chunkId,
              sectionPath: result.sectionPath,
              sourceStart: result.sourceStart,
              sourceEnd: result.sourceEnd,
            })),
            '제공된 내부 근거에 있는 내용만 답변하고, 핵심 주장마다 해당 근거 번호 [1], [2]를 표시하세요. 근거가 부족한 부분은 단정하지 마세요.',
          );
          const citedNumbers = [...answer.matchAll(/\[(\d+)\]/g)].map((match) => Number(match[1]));
          if (citedNumbers.length === 0 || citedNumbers.some((number) => number < 1 || number > references.length)) {
            state.answerCitationStatus = 'MISSING_OR_INVALID';
            answerStatus = 'ANSWER_CITATION_FAILED';
            answer = '근거 번호를 확인할 수 있는 답변을 만들지 못했습니다. 잠시 후 다시 질문해 주세요.';
          } else {
            state.answerCitationStatus = 'CITATION_IDS_VALID';
            state.trustedInternalEvidence = true;
            answerStatus = 'INTERNAL_EVIDENCE';
            shouldPersist = true;
          }
        } catch {
          references = [];
          answerStatus = 'ANSWER_GENERATION_FAILED';
          answer = '근거는 찾았지만 답변 생성 서비스에 문제가 있어 답변하지 않았습니다. 잠시 후 다시 시도해 주세요.';
        }
      }
    }

    state.answerStatus = answerStatus;
    const completedState: Record<string, unknown> = { ...state, finishedAt: new Date().toISOString() };
    if (!shouldPersist) {
      return {
        id: null,
        question: dto.question,
        answer,
        usedTools,
        agentRoute: route,
        agentState: completedState,
        retrievalStatus: completedState.retrievalStatus,
        externalAugmentationStatus: completedState.externalAugmentationStatus,
        answerStatus,
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
      answerStatus,
      references,
      isPublic: question.isPublic,
      createdAt: question.createdAt,
    };
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
