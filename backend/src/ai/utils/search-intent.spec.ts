import { classifySearchIntent } from './search-intent';

describe('classifySearchIntent', () => {
  it.each([
    ['게임랩, 게임 테크랩 최근 면접 후기 내용을 요약해줘', 'RECENT_REVIEW'],
    ['올해 정글 수료 후기 알려줘', 'RECENT_REVIEW'],
    ['정글 1주차 생활 후기를 알려줘', 'REVIEW'],
    ['다음 기수 공식 지원 마감일은 언제인가요?', 'OFFICIAL_FACT'],
    ['등록금 환불 규정은 무엇인가요?', 'OFFICIAL_FACT'],
    ['핀토스 주차 전에 무엇을 공부하면 좋나요?', 'GENERAL_KNOWLEDGE'],
  ] as const)('%s => %s', (question, expected) => {
    expect(classifySearchIntent(question)).toBe(expected);
  });
});
