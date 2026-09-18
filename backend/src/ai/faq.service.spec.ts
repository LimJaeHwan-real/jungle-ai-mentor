import { FaqService } from './faq.service';

describe('FaqService 외부 자료 공개 방지', () => {
  it.each(['BLOG_SEARCH_TOOL', 'WEB_SEARCH_TOOL', 'GITHUB_MCP_TOOL'])(
    '%s를 사용한 기존 질문 기록은 FAQ로 복사하지 않는다',
    async (tool) => {
      const questions = {
        findOne: jest.fn(async () => ({ id: 'question-1', question: '정글 후기', answer: '외부 자료 요약', usedTools: [tool] })),
        save: jest.fn(),
      };
      const faqs = { findOne: jest.fn(), create: jest.fn(), save: jest.fn() };
      const service = new FaqService(questions as never, faqs as never);

      await expect(service.publish('question-1', {})).rejects.toThrow('외부 자료');
      expect(questions.save).not.toHaveBeenCalled();
      expect(faqs.save).not.toHaveBeenCalled();
    },
  );
});

describe('FaqService 내부 근거 후보', () => {
  it('질문 문장 전체가 달라도 핵심 단어로 신뢰 가능한 FAQ를 찾고 식별자를 유지한다', async () => {
    const qb = {
      innerJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn(async () => [{
        id: 'faq-1', title: '가상 메모리 학습 안내', question: '핀토스의 가상 메모리는 무엇인가요?',
        answer: '페이지 테이블과 주소 변환을 먼저 공부하세요.', category: 'STUDY',
        aiQuestion: { usedTools: ['RAG_SEARCH_TOOL'], agentState: { trustedInternalEvidence: true } },
      }]),
    };
    const faqs = { createQueryBuilder: jest.fn(() => qb) };
    const service = new FaqService({} as never, faqs as never);

    const results = await service.searchForAgent('핀토스에서 가상 메모리를 어떻게 준비하나요?');

    expect(results).toEqual([expect.objectContaining({
      faqId: 'faq-1', chunkId: 'faq:faq-1', title: '가상 메모리 학습 안내',
      chunkText: '핀토스의 가상 메모리는 무엇인가요?\n페이지 테이블과 주소 변환을 먼저 공부하세요.',
    })]);
    expect(qb.andWhere.mock.calls.some(([clause, params]) =>
      String(clause).includes('ILIKE') && JSON.stringify(params).includes('핀토스'))).toBe(true);
  });

  it('출처 확인 표식이 없거나 외부 도구를 사용한 FAQ는 자동 후보에서 제외한다', async () => {
    const qb = {
      innerJoinAndSelect: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(), orderBy: jest.fn().mockReturnThis(), take: jest.fn().mockReturnThis(),
      getMany: jest.fn(async () => [
        { id: 'old', title: '정글 후기', question: '정글 후기', answer: '예전 요약', aiQuestion: { usedTools: ['RAG_SEARCH_TOOL'], agentState: {} } },
        { id: 'external', title: '정글 후기', question: '정글 후기', answer: '외부 요약', aiQuestion: { usedTools: ['WEB_SEARCH_TOOL'], agentState: { trustedInternalEvidence: true } } },
      ]),
    };
    const service = new FaqService({} as never, { createQueryBuilder: jest.fn(() => qb) } as never);

    expect(await service.searchForAgent('정글 후기 알려줘')).toEqual([]);
    expect(qb.where.mock.calls.some(([clause]) => String(clause).includes('trustedInternalEvidence'))).toBe(true);
  });
});
