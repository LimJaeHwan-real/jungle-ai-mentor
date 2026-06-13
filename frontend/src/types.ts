export type PostType = 'QUESTION' | 'INFO_SHARE';
export type PostCategory = 'STUDY' | 'ADMISSION' | 'COUNSEL' | 'INFO';

export interface User {
  id: string;
  email: string;
  nickname: string;
}

export interface Post {
  id: string;
  title: string;
  content: string;
  type: PostType;
  category: PostCategory;
  viewCount: number;
  commentCount: number;
  tags: string[];
  author?: {
    id: string;
    nickname: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface Comment {
  id: string;
  postId: string;
  content: string;
  author?: {
    id: string;
    nickname: string;
  };
  createdAt: string;
}

export interface Page<T> {
  items: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface Faq {
  id: string;
  title: string;
  question: string;
  answer: string;
  category: string;
  viewCount: number;
  likeCount: number;
  createdAt: string;
}

export interface AiAnswer {
  id: string;
  question: string;
  answer: string;
  usedTools: string[];
  agentRoute: string;
  agentState: Record<string, unknown>;
  references: AiReference[];
  isPublic: boolean;
  createdAt: string;
}

export interface AiReference {
  type?: string;
  title?: string;
  sourceUrl?: string;
  snippet?: string;
  imported?: boolean;
  reason?: string;
  chunkText?: string;
  content?: string;
  score?: number;
  category?: string;
}
