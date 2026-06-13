import { FormEvent, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { MessageSquare, Search } from 'lucide-react';
import { api } from '../api';
import { EmptyState } from '../components/EmptyState';
import { Loading } from '../components/Loading';
import { Page, Post, PostCategory, PostType } from '../types';

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
  const [params, setParams] = useState<Record<string, string>>({});

  const query = useQuery({
    queryKey: ['posts', params],
    queryFn: async () => (await api.get<Page<Post>>('/posts', { params })).data,
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const nextParams: Record<string, string> = {};
    if (keyword.trim()) nextParams.keyword = keyword.trim();
    if (type) nextParams.type = type;
    if (category) nextParams.category = category;
    if (tag.trim()) nextParams.tag = tag.trim();
    setParams(nextParams);
  }

  return (
    <section className="section-block">
      <div className="section-heading">
        <h2>게시판</h2>
        <Link className="primary-button small" to="/posts/new">글쓰기</Link>
      </div>
      <form className="filter-bar" onSubmit={onSubmit}>
        <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="제목/내용 검색" />
        <select value={type} onChange={(event) => setType(event.target.value as '' | PostType)}>
          {postTypes.map((item) => (
            <option key={item.value} value={item.value}>{item.label}</option>
          ))}
        </select>
        <select value={category} onChange={(event) => setCategory(event.target.value as '' | PostCategory)}>
          {categories.map((item) => (
            <option key={item.value} value={item.value}>{item.label}</option>
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
        <div className="item-list">
          {query.data.items.map((post) => (
            <Link className="list-item" key={post.id} to={`/posts/${post.id}`}>
              <div>
                <span className="route-badge">{post.type === 'QUESTION' ? '질문' : '정보공유'} · {post.category}</span>
                <strong>{post.title}</strong>
                <span>{post.content}</span>
                <div className="tag-row">
                  {post.tags.map((item) => (
                    <span className="tag-pill" key={item}>#{item}</span>
                  ))}
                </div>
              </div>
              <small><MessageSquare size={14} /> {post.commentCount}</small>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState title="게시글이 없습니다" description="필터를 바꾸거나 새 글을 작성해보세요." />
      )}
    </section>
  );
}
