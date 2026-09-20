import { ValidationPipe } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { User } from '../users/user.entity';
import { AgentService } from './agent.service';
import { AiController } from './ai.controller';
import { AiQuestion } from './entities/ai-question.entity';
import { FaqService } from './faq.service';
import { GithubMcpService } from './github-mcp.service';
import { LlmService } from './llm.service';
import { RagService } from './rag.service';
import { WebSearchService } from './web-search.service';

describe('인증된 AI 질문 HTTP 흐름', () => {
  it('미인증 요청을 거부하고 정상 무근거 검색은 저장하지 않은 상태로 안내한다', async () => {
    const order: string[] = [];
    const save = jest.fn();
    const llmAnswer = jest.fn();
    const webSearch = jest.fn(async () => {
      order.push('web');
      return null;
    });
    const module = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: 'local-test-secret' })],
      controllers: [AiController],
      providers: [
        AgentService,
        JwtAuthGuard,
        { provide: getRepositoryToken(User), useValue: { findOne: jest.fn(async () => ({ id: 'local-user' })) } },
        { provide: getRepositoryToken(AiQuestion), useValue: { create: jest.fn(), save } },
        { provide: FaqService, useValue: { searchForAgent: jest.fn(async () => []) } },
        { provide: RagService, useValue: { searchWithStatus: jest.fn(async () => {
          order.push('internal');
          return { status: 'INSUFFICIENT_EVIDENCE', results: [] };
        }) } },
        { provide: WebSearchService, useValue: { search: webSearch } },
        { provide: GithubMcpService, useValue: { analyze: jest.fn() } },
        { provide: LlmService, useValue: { answer: llmAnswer } },
      ],
    }).compile();
    const app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

    try {
      await app.listen(0, '127.0.0.1');
      const port = (app.getHttpServer().address() as { port: number }).port;
      const url = `http://127.0.0.1:${port}/api/ai/ask`;
      const payload = JSON.stringify({ question: '현재 자료에 없는 모집 마감일은?' });
      const anonymous = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload });
      expect(anonymous.status).toBe(401);
      expect(order).toEqual([]);

      const token = app.get(JwtService).sign({ sub: 'local-user' });
      const authenticated = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: payload,
      });
      expect(authenticated.status).toBe(201);
      expect(await authenticated.json()).toMatchObject({
        id: null,
        answerStatus: 'NO_EVIDENCE',
        retrievalStatus: 'INSUFFICIENT_EVIDENCE',
        externalAugmentationStatus: 'SEARCHED_NOT_USED',
        references: [],
      });
      expect(order).toEqual(['internal', 'web']);
      expect(webSearch).toHaveBeenCalledTimes(1);
      expect(llmAnswer).not.toHaveBeenCalled();
      expect(save).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});
