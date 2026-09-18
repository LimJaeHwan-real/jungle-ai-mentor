export type PostType = 'QUESTION' | 'INFO_SHARE';
export type PostCategory = 'STUDY' | 'ADMISSION' | 'COUNSEL' | 'INFO';

export interface User {
  id: string;
  email: string;
  nickname: string;
  isAdmin: boolean;
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
  id: string | null;
  question: string;
  answer: string;
  usedTools: string[];
  agentRoute: string;
  agentState: Record<string, unknown>;
  retrievalStatus?: 'SUFFICIENT_EVIDENCE' | 'INSUFFICIENT_EVIDENCE' | 'NO_ACTIVE_INDEX' | 'SEARCH_DEGRADED';
  externalAugmentationStatus?: 'NOT_REQUESTED' | 'SEARCHED_NOT_USED' | 'EVIDENCE_USED' | 'FAILED';
  references: AiReference[];
  isPublic: boolean;
  createdAt: string;
}

export interface AiReference {
  chunkId?: string;
  faqId?: string;
  chunkingVersion?: string;
  embeddingVersion?: string;
  indexedAt?: string;
  type?: string;
  title?: string;
  sourceUrl?: string;
  startIndex?: number;
  endIndex?: number;
  chunkText?: string;
  content?: string;
  score?: number;
  rerankScore?: number;
  category?: string;
  sectionPath?: string;
  sourceStart?: number;
  sourceEnd?: number;
}
