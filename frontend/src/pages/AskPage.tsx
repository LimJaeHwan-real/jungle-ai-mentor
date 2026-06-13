import { FormEvent, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Bot, ExternalLink, GitBranch, RefreshCw, Search, Send, UploadCloud } from 'lucide-react';
import { api, getErrorMessage } from '../api';
import { AiAnswer, Faq } from '../types';

export function AskPage() {
  const [question, setQuestion] = useState('');
  const [repositoryUrl, setRepositoryUrl] = useState('');
  const [autoBlogSearch, setAutoBlogSearch] = useState(true);
  const [answer, setAnswer] = useState<AiAnswer | undefined>();
  const [publishMessage, setPublishMessage] = useState('');
  const [syncMessage, setSyncMessage] = useState('');

  const askMutation = useMutation({
    mutationFn: async () =>
      (
        await api.post<AiAnswer>('/ai/ask', {
          question,
          repositoryUrl: repositoryUrl || undefined,
          autoBlogSearch,
        })
      ).data,
    onSuccess(data) {
      setAnswer(data);
      setPublishMessage('');
    },
  });

  const publishMutation = useMutation({
    mutationFn: async () => (await api.post<Faq>(`/ai/questions/${answer?.id}/publish`, { title: question, category: answer?.agentRoute })).data,
    onSuccess(data) {
      setPublishMessage(`FAQ로 공개했습니다: ${data.title}`);
    },
  });

  const syncBlogsMutation = useMutation({
    mutationFn: async () => (await api.post('/admin/blogs/sync', { maxResultsPerQuery: 3 })).data as {
      createdCount?: number;
      updatedCount?: number;
      skippedCount?: number;
      failedCount?: number;
    },
    onSuccess(data) {
      setSyncMessage(
        `인덱싱 완료: 새 글 ${data.createdCount ?? 0}개, 업데이트 ${data.updatedCount ?? 0}개, 유지 ${data.skippedCount ?? 0}개`,
      );
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
            <textarea value={question} onChange={(event) => setQuestion(event.target.value)} rows={8} required placeholder="정글 학습, FAQ, 저장소 분석 질문을 입력하세요." />
          </label>
          <label>
            GitHub 저장소 URL
            <div className="input-with-icon">
              <GitBranch size={17} />
              <input value={repositoryUrl} onChange={(event) => setRepositoryUrl(event.target.value)} placeholder="https://github.com/owner/repo" />
            </div>
          </label>
          <label className="checkbox-row">
            <input type="checkbox" checked={autoBlogSearch} onChange={(event) => setAutoBlogSearch(event.target.checked)} />
            <span>
              <strong>근거 부족 시 블로그 검색 보강</strong>
              <small>기본은 저장된 pgvector를 빠르게 검색하고, 근거가 없을 때만 실시간 검색합니다.</small>
            </span>
          </label>
          <button className="secondary-button" type="button" disabled={syncBlogsMutation.isPending} onClick={() => syncBlogsMutation.mutate()}>
            <RefreshCw size={17} /> {syncBlogsMutation.isPending ? '블로그 인덱싱 중' : '크래프톤 정글 블로그 미리 인덱싱'}
          </button>
          {syncBlogsMutation.error && <p className="error-text">{getErrorMessage(syncBlogsMutation.error)}</p>}
          {syncMessage && <p className="success-text">{syncMessage}</p>}
          {askMutation.error && <p className="error-text">{getErrorMessage(askMutation.error)}</p>}
          <button className="primary-button" type="submit" disabled={askMutation.isPending}>
            <Send size={17} /> {askMutation.isPending ? '블로그 검색과 답변 생성 중' : '질문하기'}
          </button>
        </form>
      </section>

      <section className="result-panel">
        <h2>답변</h2>
        {answer ? (
          <>
            <div className="tool-row">
              <span className="route-badge">{answer.agentRoute}</span>
              {answer.usedTools.map((tool) => (
                <span className="tag-pill" key={tool}>{tool}</span>
              ))}
            </div>
            <pre className="answer-box">{answer.answer}</pre>
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
                        {typeof reference.imported === 'boolean' && (
                          <span className="tag-pill">{reference.imported ? '새로 저장됨' : reference.reason ?? '이미 저장됨'}</span>
                        )}
                      </div>
                      <strong>{reference.title ?? '참고 문서'}</strong>
                      {reference.sourceUrl && (
                        <a href={reference.sourceUrl} target="_blank" rel="noreferrer">
                          출처 열기 <ExternalLink size={14} />
                        </a>
                      )}
                      <p>{reference.chunkText ?? reference.content ?? reference.snippet ?? '본문을 가져오지 못했거나 이미 저장된 문서입니다.'}</p>
                      {typeof reference.score === 'number' && <small>유사도 {reference.score.toFixed(3)}</small>}
                    </article>
                  ))}
                </div>
              ) : (
                <p className="muted-line">아직 표시할 참고 근거가 없습니다. 블로그 자동 검색을 켜고 다시 질문해보세요.</p>
              )}
            </section>
            <button className="secondary-button" type="button" disabled={publishMutation.isPending} onClick={() => publishMutation.mutate()}>
              <UploadCloud size={17} /> FAQ로 공개
            </button>
            {publishMutation.error && <p className="error-text">{getErrorMessage(publishMutation.error)}</p>}
            {publishMessage && <p className="success-text">{publishMessage}</p>}
          </>
        ) : (
          <p className="muted-line">질문을 보내면 Agent 경로, 사용 도구, 참고 근거가 이곳에 표시됩니다.</p>
        )}
      </section>
    </div>
  );
}
