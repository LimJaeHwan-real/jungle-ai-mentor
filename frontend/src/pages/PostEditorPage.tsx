import { FormEvent, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, getErrorMessage } from '../api';
import { TagInput } from '../components/TagInput';
import { Post, PostCategory, PostType } from '../types';

export function PostEditorPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [type, setType] = useState<PostType>('QUESTION');
  const [category, setCategory] = useState<PostCategory>('STUDY');
  const [tags, setTags] = useState<string[]>([]);

  const postQuery = useQuery({
    queryKey: ['post', id],
    queryFn: async () => (await api.get<Post>(`/posts/${id}`)).data,
    enabled: isEdit,
  });

  useEffect(() => {
    if (!postQuery.data) return;
    setTitle(postQuery.data.title);
    setContent(postQuery.data.content);
    setType(postQuery.data.type);
    setCategory(postQuery.data.category);
    setTags(postQuery.data.tags);
  }, [postQuery.data]);

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = { title, content, type, category, tags };
      return isEdit ? (await api.patch<Post>(`/posts/${id}`, payload)).data : (await api.post<Post>('/posts', payload)).data;
    },
    onSuccess(data) {
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      navigate(`/posts/${data.id}`);
    },
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    mutation.mutate();
  }

  return (
    <section className="form-panel">
      <h2>{isEdit ? '게시글 수정' : '게시글 작성'}</h2>
      <form className="stack-form" onSubmit={onSubmit}>
        <label>
          제목
          <input value={title} onChange={(event) => setTitle(event.target.value)} required minLength={2} />
        </label>
        <div className="form-grid">
          <label>
            유형
            <select value={type} onChange={(event) => setType(event.target.value as PostType)}>
              <option value="QUESTION">질문</option>
              <option value="INFO_SHARE">정보공유</option>
            </select>
          </label>
          <label>
            카테고리
            <select value={category} onChange={(event) => setCategory(event.target.value as PostCategory)}>
              <option value="STUDY">학습</option>
              <option value="ADMISSION">입학</option>
              <option value="COUNSEL">상담</option>
              <option value="INFO">정보</option>
            </select>
          </label>
        </div>
        <label>
          내용
          <textarea value={content} onChange={(event) => setContent(event.target.value)} rows={12} required minLength={2} />
        </label>
        <label>
          태그
          <TagInput value={tags} onChange={setTags} />
        </label>
        {mutation.error && <p className="error-text">{getErrorMessage(mutation.error)}</p>}
        <button className="primary-button" type="submit" disabled={mutation.isPending}>
          <Save size={17} /> {mutation.isPending ? '저장 중' : '저장'}
        </button>
      </form>
    </section>
  );
}

