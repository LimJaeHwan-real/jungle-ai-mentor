export type SearchIntent = 'RECENT_REVIEW' | 'REVIEW' | 'OFFICIAL_FACT' | 'GENERAL_KNOWLEDGE';

const reviewTerms = /(후기|회고|면접\s*(?:후기|경험)|경험담|리뷰|소감)/i;
const recencyTerms = /(최근|최신|올해|이번|요즘|20\d{2}년?)/i;
const officialTerms = /(공식|마감일?|모집\s*일정|신청\s*기간|환불|규정|등록금|수강료)/i;

export function classifySearchIntent(question: string): SearchIntent {
  const normalized = question.normalize('NFC');
  if (reviewTerms.test(normalized)) return recencyTerms.test(normalized) ? 'RECENT_REVIEW' : 'REVIEW';
  if (officialTerms.test(normalized)) return 'OFFICIAL_FACT';
  return 'GENERAL_KNOWLEDGE';
}
