import { FormEvent, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, MessageSquare, Search } from 'lucide-react';
import { api } from '../api';
import { EmptyState } from '../components/EmptyState';
import { Loading } from '../components/Loading';
import { Page, Post, PostCategory, PostType } from '../types';

const POSTS_PAGE_SIZE = 10;

const postTypes: Array<{ value: '' | PostType; label: string }> = [
  { value: '', label: '전체 유형' },
  { value: 'QUESTION', label: '질문' },
  { value: 'INFO_SHARE', label: '정보공유' },
];

const categories: Array<{ value: '' | PostCategory; label: string }> = [
  { value: '', label: '전체 카테고리' },
  { value: 'STUDY', label: '학습' },
  { value: 'ADMISSION', label: '입학' },
  { value: 'COUNSEL', label: '상담' },
  { value: 'INFO', label: '정보' },
];

export function PostsPage() {
  const [keyword, setKeyword] = useState('');
  const [type, setType] = useState<'' | PostType>('');
  const [category, setCategory] = useState<'' | PostCategory>('');
  const [tag, setTag] = useState('');
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<Record<string, string>>({});

  const requestParams = useMemo(
    () => ({
      ...filters,
      page,
      limit: POSTS_PAGE_SIZE,
    }),
    [filters, page],
  );

  const query = useQuery({
    queryKey: ['posts', requestParams],
    queryFn: async () => (await api.get<Page<Post>>('/posts', { params: requestParams })).data,
  });

  const meta = query.data?.meta;
  const totalPages = meta?.totalPages ?? 1;
  const pages = buildPageNumbers(page, totalPages);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const nextFilters: Record<string, string> = {};
    if (keyword.trim()) nextFilters.keyword = keyword.trim();
    if (type) nextFilters.type = type;
    if (category) nextFilters.category = category;
    if (tag.trim()) nextFilters.tag = tag.trim();
    setPage(1);
    setFilters(nextFilters);
  }

  function goToPage(nextPage: number) {
    if (nextPage < 1 || nextPage > totalPages || nextPage === page) return;
    setPage(nextPage);
  }

  return (
    <section className="section-block">
      <div className="section-heading">
        <h2>게시판</h2>
        <Link className="primary-button small" to="/posts/new">
          글쓰기
        </Link>
      </div>
      <form className="filter-bar" onSubmit={onSubmit}>
        <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="제목/내용 검색" />
        <select value={type} onChange={(event) => setType(event.target.value as '' | PostType)}>
          {postTypes.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
        <select value={category} onChange={(event) => setCategory(event.target.value as '' | PostCategory)}>
          {categories.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
        <input value={tag} onChange={(event) => setTag(event.target.value)} placeholder="태그" />
        <button className="secondary-button" type="submit">
          <Search size={16} /> 검색
        </button>
      </form>
      {query.isLoading ? (
        <Loading />
      ) : query.data?.items.length ? (
        <>
          <div className="list-summary">
            총 {meta?.total ?? query.data.items.length}개 글 · {page}/{totalPages}페이지
          </div>
          <div className="item-list">
            {query.data.items.map((post) => (
              <Link className="list-item" key={post.id} to={`/posts/${post.id}`}>
                <div>
                  <div className="list-meta">
                    <span className="route-badge">
                      {post.type === 'QUESTION' ? '질문' : '정보공유'} · {post.category}
                    </span>
                    {post.author?.nickname && <span className="author-name">{post.author.nickname}</span>}
                  </div>
                  <strong>{post.title}</strong>
                  <span>{post.content}</span>
                  <div className="tag-row list-tags">
                    {post.tags.slice(0, 3).map((item) => (
                      <span className="tag-pill" key={item}>
                        #{item}
                      </span>
                    ))}
                  </div>
                </div>
                <small>
                  <MessageSquare size={14} /> {post.commentCount}
                </small>
              </Link>
            ))}
          </div>
          {totalPages > 1 && (
            <nav className="pagination" aria-label="게시글 페이지 이동">
              <button className="icon-page-button" type="button" onClick={() => goToPage(page - 1)} disabled={page <= 1}>
                <ChevronLeft size={17} />
              </button>
              {pages.map((pageNumber) => (
                <button
                  className={`page-button ${pageNumber === page ? 'active' : ''}`}
                  key={pageNumber}
                  type="button"
                  onClick={() => goToPage(pageNumber)}
                  aria-current={pageNumber === page ? 'page' : undefined}
                >
                  {pageNumber}
                </button>
              ))}
              <button className="icon-page-button" type="button" onClick={() => goToPage(page + 1)} disabled={page >= totalPages}>
                <ChevronRight size={17} />
              </button>
            </nav>
          )}
        </>
      ) : (
        <EmptyState title="게시글이 없습니다" description="필터를 바꾸거나 새 글을 작성해보세요." />
      )}
    </section>
  );
}

function buildPageNumbers(currentPage: number, totalPages: number) {
  const start = Math.max(1, currentPage - 2);
  const end = Math.min(totalPages, start + 4);
  const adjustedStart = Math.max(1, end - 4);

  return Array.from({ length: end - adjustedStart + 1 }, (_, index) => adjustedStart + index);
}
