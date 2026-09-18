import { EvidenceAssessmentService } from './evidence-assessment.service';
import { RagSearchResult } from './rag.service';

const candidate: RagSearchResult = {
  chunkId: 'chunk-1', documentId: 'document-1', title: '면접 준비 게시글',
  category: 'BOARD_POST', chunkText: '지원자가 면접에서 받은 질문을 기록했습니다.', score: 1 / 61,
};
const config = { get: (name: string) => name === 'OPENAI_API_KEY' ? 'test-placeholder' : undefined };
const completed = (content: string) => ({ ok: true, json: async () => ({ choices: [{ message: { content } }] }) } as Response);

describe('EvidenceAssessmentService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('후보가 없으면 모델을 호출하지 않고 부족으로 판정한다', async () => {
    const request = jest.spyOn(global, 'fetch');
    await expect(new EvidenceAssessmentService(config as never).assess('질문', [])).resolves.toBe(false);
    expect(request).not.toHaveBeenCalled();
  });

  it('외부 API 없는 명시적 로컬 mock 데모는 기존 후보 표시를 유지한다', async () => {
    const request = jest.spyOn(global, 'fetch');
    const mockConfig = { get: (name: string) => ({ OPENAI_API_KEY: '', RAG_EMBEDDING_MODE: 'mock', NODE_ENV: 'development' })[name as 'OPENAI_API_KEY'] };

    await expect(new EvidenceAssessmentService(mockConfig as never).assess('데모 질문', [candidate])).resolves.toBe(true);
    expect(request).not.toHaveBeenCalled();
  });

  it('관련 없는 벡터 후보는 근거 부족이라는 모델 판정을 따른다', async () => {
    const request = jest.spyOn(global, 'fetch').mockResolvedValue(completed('{"sufficient":false,"supportingChunkIds":[]}'));
    await expect(new EvidenceAssessmentService(config as never).assess('게임랩 최근 면접 후기', [candidate])).resolves.toBe(false);
    const body = JSON.parse(request.mock.calls[0][1]?.body as string);
    expect(body.store).toBe(false);
    expect(body.messages[1].content).toContain('게임랩 최근 면접 후기');
    expect(body.messages[1].content).toContain(candidate.chunkText);
    expect(body.messages[0].content).toContain('모든 핵심 요구');
    expect(body.messages[0].content).toContain('최근');
  });

  it('실제 후보 ID를 댄 충분 판정만 받아들인다', async () => {
    const request = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(completed('{"sufficient":true,"supportingChunkIds":["chunk-1"]}'))
      .mockResolvedValueOnce(completed('{"sufficient":true,"supportingChunkIds":["unknown"]}'))
      .mockResolvedValueOnce(completed('{"sufficient":true,"supportingChunkIds":[]}'));
    const service = new EvidenceAssessmentService(config as never);
    await expect(service.assess('면접 질문은 무엇인가요?', [candidate])).resolves.toBe(true);
    await expect(service.assess('면접 질문은 무엇인가요?', [candidate])).resolves.toBe(false);
    await expect(service.assess('면접 질문은 무엇인가요?', [candidate])).resolves.toBe(false);
    expect(request).toHaveBeenCalledTimes(3);
  });

  it('모델 오류나 형식 오류는 근거 충분으로 처리하지 않는다', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(completed('not JSON')).mockRejectedValueOnce(new Error('network'));
    const service = new EvidenceAssessmentService(config as never);
    await expect(service.assess('질문', [candidate])).rejects.toThrow('근거 판정');
    await expect(service.assess('질문', [candidate])).rejects.toThrow('근거 판정');
  });
});
