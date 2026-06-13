import { FormEvent, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { EmptyState } from '../components/EmptyState';
import { Loading } from '../components/Loading';
import { Faq, Page } from '../types';

export function FaqListPage() {
  const [keyword, setKeyword] = useState('');
  const [category, setCategory] = useState('');
  const [params, setParams] = useState({ keyword: '', category: '' });
  const query = useQuery({
    queryKey: ['faq', params],
    queryFn: async () => (await api.get<Page<Faq>>('/faq', { params })).data,
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setParams({ keyword, category });
  }

  return (
    <section className="section-block">
      <div className="section-heading">
        <h2>공개 FAQ</h2>
      </div>
      <form className="filter-bar" onSubmit={onSubmit}>
        <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="키워드 검색" />
        <input value={category} onChange={(event) => setCategory(event.target.value)} placeholder="카테고리" />
        <button className="secondary-button" type="submit">
          <Search size={16} /> 검색
        </button>
      </form>
      {query.isLoading ? (
        <Loading />
      ) : query.data?.items.length ? (
        <div className="faq-grid">
          {query.data.items.map((faq) => (
            <Link className="faq-card" key={faq.id} to={`/faq/${faq.id}`}>
              <span>{faq.category}</span>
              <strong>{faq.title}</strong>
              <small>조회 {faq.viewCount}</small>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState title="검색 결과가 없습니다" description="다른 키워드나 카테고리로 검색해보세요." />
      )}
    </section>
  );
}

