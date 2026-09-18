import type { AiAnswer } from '../types';

const answerStatusLabels: Record<NonNullable<AiAnswer['answerStatus']>, string> = {
  GITHUB_URL_REQUIRED: 'GitHub 주소 필요',
  GITHUB_ANALYSIS: 'GitHub 분석 답변',
  WEB_EVIDENCE: '웹 근거 답변',
  INTERNAL_SEARCH_FAILED: '내부 검색 장애',
  NO_ACTIVE_INDEX: '활성 색인 없음',
  WEB_SEARCH_FAILED: '웹 검색 실패',
  NO_EVIDENCE: '답할 근거 없음',
  ANSWER_CITATION_FAILED: '답변 인용 확인 실패',
  INTERNAL_EVIDENCE: '내부 근거 답변',
};

export function answerStatusLabel(status: AiAnswer['answerStatus']) {
  return status ? answerStatusLabels[status] : undefined;
}
