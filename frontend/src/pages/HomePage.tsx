import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Bot, Database, GitBranch, MessagesSquare } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { EmptyState } from '../components/EmptyState';
import { Loading } from '../components/Loading';
import { Faq, Page, Post } from '../types';

export function HomePage() {
  const postsQuery = useQuery({
    queryKey: ['posts', 'home'],
    queryFn: async () => (await api.get<Page<Post>>('/posts?limit=5')).data,
  });
  const faqQuery = useQuery({
    queryKey: ['faq', 'home'],
    queryFn: async () => (await api.get<Page<Faq>>('/faq?limit=4')).data,
  });

  return (
    <div className="page-grid">
      <section className="overview-band">
        <div>
          <span className="eyebrow">RAG + MCP + Agent</span>
          <h2>정글 학습 질문을 문서, FAQ, 저장소 분석으로 라우팅합니다</h2>
          <p>게시판의 질문 흐름과 AI 답변 공개 흐름을 한 화면에서 이어갈 수 있는 MVP입니다.</p>
          <div className="button-row">
            <Link className="primary-button" to="/ask">
              <Bot size={17} /> AI에게 질문
            </Link>
            <Link className="secondary-button" to="/posts">
              게시판 보기 <ArrowRight size={16} />
            </Link>
          </div>
        </div>
        <div className="signal-panel" aria-hidden="true">
          <div className="signal-line rag"><Database size={18} /> RAG_SEARCH_TOOL</div>
          <div className="signal-line mcp"><GitBranch size={18} /> GITHUB_MCP_TOOL</div>
          <div className="signal-line faq"><MessagesSquare size={18} /> FAQ_SEARCH_TOOL</div>
        </div>
      </section>

      <section className="section-block">
        <div className="section-heading">
          <h2>최근 게시글</h2>
          <Link to="/posts">전체 보기</Link>
        </div>
        {postsQuery.isLoading ? (
          <Loading />
        ) : postsQuery.data?.items.length ? (
          <div className="item-list">
            {postsQuery.data.items.map((post) => (
              <Link className="list-item" key={post.id} to={`/posts/${post.id}`}>
                <div>
                  <strong>{post.title}</strong>
                  <span>{post.content}</span>
                </div>
                <small>{post.commentCount} comments</small>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState title="게시글이 없습니다" description="첫 질문이나 정보 공유 글을 작성해보세요." />
        )}
      </section>

      <section className="section-block">
        <div className="section-heading">
          <h2>공개 FAQ</h2>
          <Link to="/faq">전체 보기</Link>
        </div>
        {faqQuery.isLoading ? (
          <Loading />
        ) : faqQuery.data?.items.length ? (
          <div className="faq-grid">
            {faqQuery.data.items.map((faq) => (
              <Link className="faq-card" key={faq.id} to={`/faq/${faq.id}`}>
                <span>{faq.category}</span>
                <strong>{faq.title}</strong>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState title="공개 FAQ가 없습니다" description="AI 답변을 발행하면 이곳에 쌓입니다." />
        )}
      </section>
    </div>
  );
}

