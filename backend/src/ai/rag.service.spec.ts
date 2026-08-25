import { RagService } from './rag.service';

describe('RagService 구조 보존 chunking', () => {
  const split = (content: string) => {
    const service = Object.create(RagService.prototype) as { chunkSize: number; chunkOverlap: number; splitText: RagService['splitText'] };
    service.chunkSize = 700;
    service.chunkOverlap = 120;
    return service.splitText(content);
  };

  it('Markdown 제목 경계에서 chunk를 나누고 section path를 보존한다', () => {
    const chunks = split('# 시작\n첫 번째 내용입니다.\n\n## 준비\n준비 내용입니다.\n\n# 마무리\n마무리 내용입니다.');
    expect(chunks.map((chunk) => chunk.sectionPath)).toEqual(['시작', '시작 > 준비', '마무리']);
  });

  it('각 chunk의 원문 범위를 기록하고 중복 chunk를 제거한다', () => {
    const chunks = split('# 문서\n같은 내용입니다.\n\n같은 내용입니다.');
    expect(chunks[0]).toMatchObject({ sourceStart: 0 });
    expect(chunks[0].sourceEnd).toBeGreaterThan(chunks[0].sourceStart);
  });
});
