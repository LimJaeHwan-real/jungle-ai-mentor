import { FormEvent, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Bot, ExternalLink, Search, Send, UploadCloud } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api, getErrorMessage } from '../api';
import { AiAnswer, Faq } from '../types';
import { AnswerMarkdown, publicUrl } from '../components/AnswerMarkdown';
import { answerStatusLabel } from '../utils/answer-status';

export function AskPage() {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<AiAnswer | undefined>();
  const [publishMessage, setPublishMessage] = useState('');

  const askMutation = useMutation({
    mutationFn: async () =>
      (
        await api.post<AiAnswer>('/ai/ask', {
          question,
        })
      ).data,
    onSuccess(data) {
      setAnswer(data);
      setPublishMessage('');
    },
  });

  const publishMutation = useMutation({
    mutationFn: async () =>
      (
        await api.post<Faq>(`/ai/questions/${answer?.id}/publish`, {
          title: question,
          category: answer?.agentRoute,
        })
      ).data,
    onSuccess(data) {
      setPublishMessage(`FAQ로 공개했습니다: ${data.title}`);
    },
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    askMutation.mutate();
  }

  return (
    <div className="two-column">
      <section className="form-panel">
        <div className="section-heading compact">
          <h2>AI 질문</h2>
          <Bot size={22} />
        </div>
        <form className="stack-form" onSubmit={onSubmit}>
          <label>
            질문
            <textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              rows={8}
              required
              placeholder="정글 학습, FAQ, 블로그 후기 관련 질문을 입력하세요."
            />
          </label>
          {askMutation.error && <p className="error-text">{getErrorMessage(askMutation.error)}</p>}
          <button className="primary-button" type="submit" disabled={askMutation.isPending}>
            <Send size={17} /> {askMutation.isPending ? '근거 검색과 답변 생성 중' : '질문하기'}
          </button>
        </form>
      </section>

      <section className="result-panel">
        <h2>답변</h2>
        {answer ? (
          <>
            <div className="tool-row">
              <span className="route-badge">{answer.agentRoute}</span>
              {answer.answerStatus && <span className="tag-pill">답변 상태: {answerStatusLabel(answer.answerStatus)}</span>}
              {answer.retrievalStatus && <span className="tag-pill">검색 상태: {answer.retrievalStatus}</span>}
              {answer.externalAugmentationStatus && answer.externalAugmentationStatus !== 'NOT_REQUESTED' && (
                <span className="tag-pill">외부 보강: {{
                  SEARCHED_NOT_USED: '검색했지만 답변 근거로 사용 안 함',
                  EVIDENCE_USED: '답변 근거로 사용',
                  FAILED: '검색 실패',
                }[answer.externalAugmentationStatus]}</span>
              )}
              {answer.usedTools.map((tool) => (
                <span className="tag-pill" key={tool}>
                  {tool}
                </span>
              ))}
            </div>
            <AnswerMarkdown answer={answer.answer} references={answer.references} />
            <section className="reference-section">
              <div className="section-heading compact">
                <h3>참고 근거</h3>
                <Search size={18} />
              </div>
              {answer.references.length ? (
                <div className="reference-list">
                  {answer.references.map((reference, index) => (
                    <article className="reference-card" key={`${reference.sourceUrl ?? reference.title ?? 'reference'}-${index}`}>
                      <div>
                        <span className="route-badge">{reference.type ?? reference.category ?? 'RAG'}</span>
                      </div>
                      <strong>[{index + 1}] {reference.title ?? '참고 문서'}</strong>
                      {reference.sectionPath && <small>문서 위치: {reference.sectionPath}</small>}
                      {reference.chunkId && <small>근거 chunk: {reference.chunkId}</small>}
                      {reference.faqId && <Link to={`/faq/${reference.faqId}`}>FAQ 원문 열기</Link>}
                      {publicUrl(reference.sourceUrl) && (
                        <a href={publicUrl(reference.sourceUrl)!} target="_blank" rel="noopener noreferrer">
                          출처 열기 <ExternalLink size={14} />
                        </a>
                      )}
                      {reference.type !== 'WEB_SEARCH' && (reference.chunkText || reference.content) && (
                        <p>{reference.chunkText ?? reference.content}</p>
                      )}
                      {typeof reference.sourceStart === 'number' && typeof reference.sourceEnd === 'number' && (
                        <small>원문 범위: {reference.sourceStart}–{reference.sourceEnd}</small>
                      )}
                      {typeof reference.score === 'number' && <small>유사도 {reference.score.toFixed(3)}</small>}
                    </article>
                  ))}
                </div>
              ) : (
                <p className="muted-line">
                  {answer.retrievalStatus === 'SEARCH_DEGRADED'
                    ? '근거 검색 서비스에 문제가 있어 참고 근거를 표시하지 않았습니다. 잠시 후 다시 시도해 주세요.'
                    : answer.retrievalStatus === 'NO_ACTIVE_INDEX'
                      ? '현재 활성 지식 색인이 없어 참고 근거를 표시하지 않았습니다. 문서 색인 후 다시 시도해 주세요.'
                    : answer.retrievalStatus === 'INSUFFICIENT_EVIDENCE'
                      ? '답변에 사용할 만큼 충분한 근거를 찾지 못했습니다. 질문을 더 구체적으로 바꿔 다시 시도해보세요.'
                      : '아직 표시할 참고 근거가 없습니다.'}
                </p>
              )}
            </section>
            {answer.id ? (
              <button className="secondary-button" type="button" disabled={publishMutation.isPending} onClick={() => publishMutation.mutate()}>
                <UploadCloud size={17} /> FAQ로 공개
              </button>
            ) : <p className="muted-line">이 답변은 저장되지 않아 FAQ로 공개할 수 없습니다.</p>}
            {publishMutation.error && <p className="error-text">{getErrorMessage(publishMutation.error)}</p>}
            {publishMessage && <p className="success-text">{publishMessage}</p>}
          </>
        ) : (
          <p className="muted-line">질문을 보내면 Agent 경로, 사용 도구, 참고 근거가 여기에 표시됩니다.</p>
        )}
      </section>
    </div>
  );
}
