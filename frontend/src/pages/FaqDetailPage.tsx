import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { api } from '../api';
import { Loading } from '../components/Loading';
import { Faq } from '../types';

export function FaqDetailPage() {
  const { id } = useParams();
  const query = useQuery({
    queryKey: ['faq', id],
    queryFn: async () => (await api.get<Faq>(`/faq/${id}`)).data,
    enabled: Boolean(id),
  });

  if (query.isLoading) return <Loading />;
  if (!query.data) return <p className="error-text">FAQ를 찾을 수 없습니다.</p>;

  return (
    <article className="detail-view">
      <span className="route-badge">{query.data.category}</span>
      <h2>{query.data.title}</h2>
      <div className="question-box">{query.data.question}</div>
      <pre className="answer-box">{query.data.answer}</pre>
      <p className="muted-line">조회 {query.data.viewCount} · 좋아요 {query.data.likeCount}</p>
    </article>
  );
}

