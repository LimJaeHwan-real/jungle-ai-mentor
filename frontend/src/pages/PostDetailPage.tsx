import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Edit3, MessageSquare, Send, Trash2 } from 'lucide-react';
import { api, getErrorMessage } from '../api';
import { EmptyState } from '../components/EmptyState';
import { Loading } from '../components/Loading';
import { useAuth } from '../state/AuthContext';
import { Comment, Post } from '../types';

export function PostDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, token } = useAuth();
  const [comment, setComment] = useState('');
  const [editingCommentId, setEditingCommentId] = useState<string | undefined>();
  const [editingContent, setEditingContent] = useState('');

  const postQuery = useQuery({
    queryKey: ['post', id],
    queryFn: async () => (await api.get<Post>(`/posts/${id}`)).data,
    enabled: Boolean(id),
  });

  const commentsQuery = useQuery({
    queryKey: ['comments', id],
    queryFn: async () => (await api.get<Comment[]>(`/posts/${id}/comments`)).data,
    enabled: Boolean(id),
  });

  const createComment = useMutation({
    mutationFn: async () => (await api.post<Comment>(`/posts/${id}/comments`, { content: comment })).data,
    onSuccess() {
      setComment('');
      queryClient.invalidateQueries({ queryKey: ['comments', id] });
      queryClient.invalidateQueries({ queryKey: ['post', id] });
    },
  });

  const updateComment = useMutation({
    mutationFn: async () => (await api.patch<Comment>(`/comments/${editingCommentId}`, { content: editingContent })).data,
    onSuccess() {
      setEditingCommentId(undefined);
      setEditingContent('');
      queryClient.invalidateQueries({ queryKey: ['comments', id] });
    },
  });

  const deleteComment = useMutation({
    mutationFn: async (commentId: string) => (await api.delete(`/comments/${commentId}`)).data,
    onSuccess() {
      queryClient.invalidateQueries({ queryKey: ['comments', id] });
      queryClient.invalidateQueries({ queryKey: ['post', id] });
    },
  });

  const deletePost = useMutation({
    mutationFn: async () => (await api.delete(`/posts/${id}`)).data,
    onSuccess() {
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      navigate('/posts');
    },
  });

  function onCommentSubmit(event: FormEvent) {
    event.preventDefault();
    createComment.mutate();
  }

  if (postQuery.isLoading) return <Loading />;
  if (!postQuery.data) return <p className="error-text">게시글을 찾을 수 없습니다.</p>;

  const post = postQuery.data;
  const canEditPost = token && user?.id === post.author?.id;

  return (
    <div className="detail-layout">
      <article className="detail-view">
        <div className="detail-actions">
          <span className="route-badge">{post.type === 'QUESTION' ? '질문' : '정보공유'} · {post.category}</span>
          {canEditPost && (
            <div className="button-row">
              <Link className="secondary-button small" to={`/posts/${post.id}/edit`}>
                <Edit3 size={15} /> 수정
              </Link>
              <button className="danger-button small" type="button" onClick={() => deletePost.mutate()}>
                <Trash2 size={15} /> 삭제
              </button>
            </div>
          )}
        </div>
        <h2>{post.title}</h2>
        <p className="muted-line">작성자 {post.author?.nickname ?? '알 수 없음'} · 조회 {post.viewCount}</p>
        <div className="tag-row">
          {post.tags.map((tag) => (
            <span className="tag-pill" key={tag}>#{tag}</span>
          ))}
        </div>
        <div className="post-content">{post.content}</div>
      </article>

      <section className="section-block">
        <div className="section-heading compact">
          <h2>댓글</h2>
          <span className="count-chip"><MessageSquare size={14} /> {post.commentCount}</span>
        </div>
        {token ? (
          <form className="comment-form" onSubmit={onCommentSubmit}>
            <textarea value={comment} onChange={(event) => setComment(event.target.value)} rows={3} required placeholder="댓글 작성" />
            <button className="secondary-button" type="submit" disabled={createComment.isPending}>
              <Send size={16} /> 등록
            </button>
          </form>
        ) : (
          <p className="muted-line">댓글을 작성하려면 로그인하세요.</p>
        )}
        {createComment.error && <p className="error-text">{getErrorMessage(createComment.error)}</p>}
        {commentsQuery.isLoading ? (
          <Loading />
        ) : commentsQuery.data?.length ? (
          <div className="comment-list">
            {commentsQuery.data.map((item) => {
              const canEdit = user?.id === item.author?.id;
              const isEditing = editingCommentId === item.id;
              return (
                <div className="comment-item" key={item.id}>
                  <strong>{item.author?.nickname ?? '알 수 없음'}</strong>
                  {isEditing ? (
                    <div className="comment-edit">
                      <textarea value={editingContent} onChange={(event) => setEditingContent(event.target.value)} rows={3} />
                      <button className="secondary-button small" type="button" onClick={() => updateComment.mutate()}>
                        저장
                      </button>
                    </div>
                  ) : (
                    <p>{item.content}</p>
                  )}
                  {canEdit && !isEditing && (
                    <div className="button-row">
                      <button className="ghost-button small" type="button" onClick={() => {
                        setEditingCommentId(item.id);
                        setEditingContent(item.content);
                      }}>
                        수정
                      </button>
                      <button className="ghost-button small danger-text" type="button" onClick={() => deleteComment.mutate(item.id)}>
                        삭제
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState title="댓글이 없습니다" description="첫 댓글로 토론을 시작해보세요." />
        )}
      </section>
    </div>
  );
}

