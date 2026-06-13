# 정글 AI 멘토 게시판 MVP 구현 계획서

## Summary
과제 필수조건을 모두 만족하도록, 기존 MVP인 “정글 AI 멘토”를 AI 기반 학습 커뮤니티 게시판으로 구현한다.

사용자는 회원가입/로그인 후 게시글과 댓글을 작성하고, 태그/검색/페이징으로 게시판을 탐색할 수 있다. AI 기능은 정글 학습 자료와 공개 FAQ를 기반으로 답변하는 RAG Q&A, GitHub 저장소를 분석하는 MCP 연동, 질문 유형에 따라 도구를 선택하는 AI Agent로 구성한다.

기술 스택은 React(TypeScript), NestJS(TypeScript), PostgreSQL, pgvector, LangChain, OpenAI API를 사용한다.

## MVP Scope
- 기본 게시판 필수 기능
  - 회원가입 / 로그인
  - 게시글 CRUD
  - 댓글 CRUD
  - 태그
  - 페이징
  - 검색
  - 질문/정보공유 게시판 분리

- AI 필수 기능
  - RAG 기반 지식 베이스 Q&A
  - MCP 기반 GitHub 저장소 분석
  - AI Agent 기반 Tool Routing

- 제외 기능
  - 자동 구글링
  - 무제한 웹 크롤러
  - RSS/sitemap 주기 수집
  - 게시판 전체 데이터를 자동으로 RAG에 넣는 기능
  - 복잡한 관리자 권한 시스템

## Tech Stack
- Frontend
  - React
  - TypeScript
  - React Router
  - Axios
  - TanStack Query

- Backend
  - NestJS
  - TypeScript
  - TypeORM

- Database
  - PostgreSQL
  - pgvector

- AI
  - OpenAI 상용 LLM
  - OpenAI Embeddings
  - LangChain
  - pgvector 기반 Vector Search

- MCP
  - NestJS 내부 MCP 모듈
  - JSON-RPC 기반 요청/응답 구조
  - GitHub 외부 서비스 연동
  - `GITHUB_TOKEN` 환경 변수 기반 권한 관리
  - Mock/Fallback Adapter 제공

## Core User Features
- Auth
  - `POST /api/auth/signup`
  - `POST /api/auth/login`
  - `GET /api/auth/me`
  - JWT 인증 사용
  - 비밀번호는 bcrypt hash로 저장

- Posts
  - 게시글 유형: `QUESTION`, `INFO_SHARE`
  - 질문 카테고리: `STUDY`, `ADMISSION`, `COUNSEL`
  - 정보 공유 카테고리: `INFO`
  - API:
    - `POST /api/posts`
    - `GET /api/posts?page=&limit=&keyword=&type=&category=&tag=`
    - `GET /api/posts/:id`
    - `PATCH /api/posts/:id`
    - `DELETE /api/posts/:id`

- Comments
  - API:
    - `POST /api/posts/:postId/comments`
    - `GET /api/posts/:postId/comments`
    - `PATCH /api/comments/:id`
    - `DELETE /api/comments/:id`

- Tags/Search/Pagination
  - 게시글 작성/수정 시 태그 배열 저장
  - 목록에서 keyword, type, category, tag 필터 지원
  - page/limit 기반 페이징 제공

## AI Features
- RAG 기능
  - 관리자 문서와 공개 FAQ를 RAG 검색 대상으로 사용한다.
  - 문서 등록 흐름:
    - 문서 등록
    - 텍스트 정제
    - chunk 분할
    - OpenAI Embedding 생성
    - pgvector 저장
  - API:
    - `POST /api/admin/documents`
    - `POST /api/ai/ask`
    - `POST /api/ai/questions/:id/publish`
  - 답변에는 참고 문서 제목, 카테고리, 출처, chunk 일부를 포함한다.

- MCP 기능
  - GitHub 저장소 분석을 MVP 외부 서비스 연동 대상으로 선택한다.
  - repositoryUrl을 입력하면 README, 파일 구조, 관련 파일 후보를 조회한다.
  - JSON-RPC 스타일 요청/응답 구조를 MCP service layer에 둔다.
  - API:
    - `POST /api/mcp/github/analyze`
  - `MCP_GITHUB_MODE`:
    - `mock`: 외부 연동 없이 fallback 응답
    - `github_api`: GitHub REST API 사용
    - `mcp_stdio`: 외부 MCP stdio server 사용
  - token이나 MCP 설정이 없어도 앱이 죽지 않고 fallback 응답을 반환한다.

- AI Agent 기능
  - `/api/ai/ask`는 반드시 `AgentService`를 거친다.
  - Agent는 질문을 분류하고 필요한 도구를 선택한다.
  - Route:
    - `JUNGLE_KNOWLEDGE`
    - `FAQ_SEARCH`
    - `GITHUB_REPO`
    - `GENERAL`
  - Tools:
    - `RAG_SEARCH_TOOL`
    - `FAQ_SEARCH_TOOL`
    - `GITHUB_MCP_TOOL`
    - `GENERAL_LLM_TOOL`
  - 추론 루프는 최대 3회로 제한한다.
  - 각 실행 기록은 `agentState`, `usedTools`, `agentRoute`로 저장한다.
  - Tool 실패 시 전체 답변을 실패시키지 않고 fallback한다.

## Data Model
- `users`
  - `id`, `email`, `passwordHash`, `nickname`, `createdAt`, `updatedAt`

- `posts`
  - `id`, `userId`, `title`, `content`, `type`, `category`, `viewCount`, `commentCount`, timestamps

- `comments`
  - `id`, `postId`, `userId`, `content`, timestamps

- `tags`
  - `id`, `name`, `createdAt`

- `post_tags`
  - `postId`, `tagId`

- `ai_questions`
  - `id`, `userId`, `question`, `answer`, `usedTools`, `agentRoute`, `agentState`, `isPublic`, timestamps

- `faqs`
  - `id`, `aiQuestionId`, `title`, `question`, `answer`, `category`, `viewCount`, `likeCount`, timestamps

- `documents`
  - `id`, `title`, `content`, `category`, `sourceType`, `sourceUrl`, `contentHash`, timestamps

- `document_chunks`
  - `id`, `documentId`, `chunkIndex`, `chunkText`, `embedding vector(1536)`, `tokenCount`, `createdAt`

## Frontend Pages
- `/`
  - 서비스 소개
  - AI 질문 CTA
  - 최근 FAQ 일부 표시

- `/signup`
  - 회원가입

- `/login`
  - 로그인

- `/ask`
  - AI 질문 입력
  - GitHub repositoryUrl 선택 입력
  - AI 답변 표시
  - 사용 Tool 표시
  - 참고 출처 표시
  - FAQ 공개 버튼

- `/faq`
  - 공개 FAQ 목록
  - keyword 검색
  - category 필터

- `/faq/:id`
  - FAQ 상세
  - viewCount 증가

- `/posts`
  - 게시글 목록
  - 검색
  - 페이징
  - 유형/카테고리/태그 필터

- `/posts/new`
  - 게시글 작성

- `/posts/:id`
  - 게시글 상세
  - 댓글 목록/작성
  - 수정/삭제 버튼

- `/posts/:id/edit`
  - 게시글 수정

## Implementation Order
1. 현재 저장소 구조 확인 후 `backend/`, `frontend/`, `docker-compose.yml` 구성
2. NestJS + TypeORM + PostgreSQL + pgvector 설정
3. Auth 구현: 회원가입, 로그인, JWT 인증
4. 게시판 구현: 게시글 CRUD, 댓글 CRUD, 태그, 검색, 페이징
5. RAG 구현: 문서 등록, chunking, embedding, vector search
6. FAQ 구현: AI 질문/답변 공개, FAQ 목록/상세, RAG 대상 추가
7. MCP 구현: GitHub adapter, JSON-RPC 구조, mock/fallback
8. Agent 구현: 질문 분류, ToolRegistry, Tool 실행, fallback
9. React 화면 구현: auth, posts, comments, FAQ, ask
10. README 작성: 실행 방법, 아키텍처, RAG/MCP/Agent 설명, 데모, 회고

## README Requirements
README에는 제출 조건에 맞춰 다음을 포함한다.

- 프로젝트 개요
- 주요 구현 기능
- 전체 아키텍처 구조
- RAG 기능, 기술, 아키텍처 구조
- MCP 기능, 기술, 아키텍처 구조
- Agent 기능, 기술, 아키텍처 구조
- 실행 방법
- 환경 변수 설정
- 주요 API 테스트 예시
- 데모 스크린샷 1개 이상
- 회고, 한계점, 개선 아이디어

## Test Plan
- Backend
  - `npm run build`
  - `npm run test`
  - 회원가입/로그인/JWT 확인
  - 게시글 CRUD 확인
  - 댓글 CRUD 확인
  - 태그/검색/페이징 확인
  - 문서 등록 후 pgvector 저장 확인
  - `/api/ai/ask`가 AgentService를 경유하는지 확인
  - MCP mock/fallback 동작 확인

- Frontend
  - `npm run build`
  - 회원가입/로그인 플로우 확인
  - 게시글 목록/작성/수정/삭제 확인
  - 댓글 작성/수정/삭제 확인
  - AI 질문 답변, 출처, usedTools 표시 확인
  - FAQ 공개 후 `/faq` 표시 확인

## Assumptions
- 과제 필수조건을 우선한다.
- 따라서 회원가입/로그인은 MVP에 포함한다.
- RAG 대상은 관리자 문서와 공개 FAQ로 제한한다.
- MCP 외부 서비스는 GitHub로 선택한다.
- OpenAI API key, GitHub token은 `.env.example`에 예시만 두고 코드에는 하드코딩하지 않는다.
- 외부 API key가 없어도 MCP는 mock/fallback으로 데모 가능해야 한다.
