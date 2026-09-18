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
