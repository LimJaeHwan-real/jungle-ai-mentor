# 정글 AI 멘토 게시판 MVP

React, NestJS, PostgreSQL, pgvector 기반의 AI 학습 커뮤니티 게시판 MVP입니다. 사용자는 회원가입/로그인 후 질문과 정보 공유 글을 작성하고, 댓글과 태그/검색/페이징으로 게시판을 사용할 수 있습니다. AI 기능은 RAG Q&A, GitHub 저장소 MCP 분석, Agent 기반 tool routing으로 구성했습니다.

## 주요 기능
- JWT 기반 회원가입, 로그인, 내 정보 조회
- 게시글 CRUD, 댓글 CRUD, 태그, 검색, 페이지네이션
- 질문 게시판과 정보공유 게시판 구분
- 관리자 문서 등록 후 chunking, embedding, pgvector 검색
- AI 질문 답변 저장과 공개 FAQ 발행
- FAQ 목록/상세, 키워드/카테고리 검색, 조회수 증가
- GitHub 저장소 분석 MCP adapter와 mock/fallback 모드
- AgentService 기반 질문 분류와 tool routing
- 크래프톤 정글 관련 블로그 사전 인덱싱, 본문 추출, RAG 저장
- OpenAI/GitHub 키가 없어도 데모 가능한 mock LLM, mock embedding, mock MCP

## 아키텍처
```text
frontend/
  React + TypeScript + React Router + TanStack Query + Axios
        |
        | REST API
        v
backend/
  NestJS + TypeORM
  AuthModule       -> users, JWT, bcryptjs
  PostsModule      -> posts, comments, tags, post_tags
  AiModule         -> documents, document_chunks, ai_questions, faqs
        |
        v
PostgreSQL + pgvector
```

## RAG 구조
1. `POST /api/admin/documents`로 문서를 등록합니다.
2. 백엔드가 문서를 chunk로 나누고 embedding을 생성합니다.
3. `OPENAI_API_KEY`가 있으면 OpenAI Embeddings를 사용합니다.
4. 키가 없으면 deterministic mock embedding을 사용합니다.
5. 검색 시 pgvector distance query를 먼저 시도하고, 실패하면 lexical fallback을 사용합니다.
6. `/api/ai/ask`는 AgentService를 거쳐 `RAG_SEARCH_TOOL`을 선택할 수 있습니다.

## MCP 구조
- API: `POST /api/mcp/github/analyze`
- `MCP_GITHUB_MODE=mock`: 외부 연결 없이 데모 분석 반환
- `MCP_GITHUB_MODE=github_api`: GitHub REST API로 README, repo metadata, root files 조회
- `MCP_GITHUB_MODE=mcp_stdio`: 인터페이스 준비 상태이며 현재 MVP에서는 mock fallback 반환
- `GITHUB_TOKEN`이 없거나 API 호출이 실패해도 전체 요청은 실패하지 않고 fallback 응답을 반환합니다.

## 블로그 사전 인덱싱 구조
질문할 때마다 블로그를 검색하면 느리고 embedding 비용이 중복으로 발생합니다. 그래서 기본 구조는 사전 인덱싱입니다.

```text
하루 1회 또는 수동 sync
→ 크래프톤 정글 관련 블로그 검색
→ 블로그 글 본문 추출
→ RagService.indexDocument()로 새 글만 embedding, 변경 글은 re-index, 동일 글은 skip
→ chunking, embedding, pgvector 저장

사용자 질문
→ 질문 embedding
→ pgvector 검색
→ 관련 chunk를 근거로 답변
```

수동 sync API:
```text
POST /api/admin/blogs/sync
```

질문 화면의 `크래프톤 정글 블로그 미리 인덱싱` 버튼도 같은 API를 호출합니다.

질문 화면의 `근거 부족 시 블로그 검색 보강` 옵션이 켜져 있으면, 저장된 pgvector 검색 결과가 없거나 너무 약할 때만 실시간 검색 fallback을 수행합니다.

검색 모드:
- `BLOG_SEARCH_MODE=duckduckgo`: 별도 키 없이 DuckDuckGo HTML 검색 fallback 사용
- `BLOG_SEARCH_MODE=naver_api`: `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`이 있으면 Naver Blog Search API 우선 사용
- `BLOG_SEARCH_MODE=off`: 자동 블로그 검색 비활성화
- `BLOG_SYNC_ENABLED=true`: 서버 실행 중 `BLOG_SYNC_INTERVAL_HOURS` 주기로 자동 sync

## Agent 구조
`/api/ai/ask` 요청은 반드시 `AgentService`를 거칩니다.

라우트:
- `JUNGLE_KNOWLEDGE`: 정글/학습/입학/상담 질문, `RAG_SEARCH_TOOL`
- `FAQ_SEARCH`: FAQ 관련 질문, `FAQ_SEARCH_TOOL`
- `GITHUB_REPO`: repository URL 또는 GitHub 질문, `GITHUB_MCP_TOOL`
- `GENERAL`: 일반 질문, `GENERAL_LLM_TOOL`

응답에는 `agentRoute`, `usedTools`, `agentState`, `references`가 포함됩니다.

## 실행 방법
Windows PowerShell에서 `npm.ps1` 실행 정책에 막히는 경우 `npm.cmd`를 사용합니다.

```powershell
Copy-Item .env.example backend\.env
docker compose up -d
npm.cmd --prefix backend install
npm.cmd --prefix frontend install
npm.cmd --prefix backend run start:dev
npm.cmd --prefix frontend run dev
```

접속:
- Frontend: `http://localhost:5173`
- Backend health: `http://localhost:3000/api/health`

## 환경 변수
`backend/.env`:

```env
PORT=3000
FRONTEND_ORIGIN=http://localhost:5173
JWT_SECRET=change-me-in-local-env
JWT_EXPIRES_IN=1d
DB_HOST=localhost
DB_PORT=5433
DB_USER=jungle
DB_PASSWORD=jungle
DB_NAME=jungle_ai_mentor
TYPEORM_SYNC=true
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
GITHUB_TOKEN=
MCP_GITHUB_MODE=mock
BLOG_SEARCH_MODE=duckduckgo
BLOG_SEARCH_MAX_RESULTS=3
BLOG_SYNC_ENABLED=false
BLOG_SYNC_INTERVAL_HOURS=24
BLOG_SYNC_RUN_ON_STARTUP=false
BLOG_SYNC_MAX_RESULTS_PER_QUERY=3
BLOG_SYNC_QUERIES=크래프톤 정글 후기 블로그|크래프톤 정글 지원 후기 블로그|크래프톤 정글 알고리즘 학습 블로그|크래프톤 정글 입학 준비 블로그|크래프톤 정글 회고 블로그
NAVER_CLIENT_ID=
NAVER_CLIENT_SECRET=
```

## 주요 API 테스트 예시
회원가입:
```powershell
curl.exe -X POST http://localhost:3000/api/auth/signup `
  -H "Content-Type: application/json" `
  -d "{\"email\":\"demo@example.com\",\"password\":\"password123\",\"nickname\":\"demo\"}"
```

로그인:
```powershell
curl.exe -X POST http://localhost:3000/api/auth/login `
  -H "Content-Type: application/json" `
  -d "{\"email\":\"demo@example.com\",\"password\":\"password123\"}"
```

문서 등록:
```powershell
curl.exe -X POST http://localhost:3000/api/admin/documents `
  -H "Content-Type: application/json" `
  -H "Authorization: Bearer <TOKEN>" `
  -d "{\"title\":\"정글 학습 가이드\",\"content\":\"정글에서는 매일 알고리즘 문제를 풀고 회고를 작성합니다.\",\"category\":\"STUDY\"}"
```

AI 질문:
```powershell
curl.exe -X POST http://localhost:3000/api/ai/ask `
  -H "Content-Type: application/json" `
  -H "Authorization: Bearer <TOKEN>" `
  -d "{\"question\":\"정글 알고리즘 학습은 어떻게 하면 좋아?\"}"
```

GitHub MCP 분석:
```powershell
curl.exe -X POST http://localhost:3000/api/mcp/github/analyze `
  -H "Content-Type: application/json" `
  -d "{\"repositoryUrl\":\"https://github.com/facebook/react\"}"
```

## 단계별 구현과 테스트
상세 체크리스트는 [IMPLEMENTATION_STEPS.md](IMPLEMENTATION_STEPS.md)에 정리했습니다.

검증 명령:
```powershell
npm.cmd --prefix backend run build
npm.cmd --prefix backend run test
npm.cmd --prefix frontend run build
```

현재 검증 결과:
- Backend build 통과
- Backend test 통과: Agent route 분류 테스트 3개
- Frontend build 통과

## 데모 스크린샷
프론트엔드 실행 후 첫 화면은 홈 대시보드에서 최근 게시글, 공개 FAQ, AI 질문 CTA, Agent tool signal을 보여줍니다.

스크린샷 저장 위치:
- `docs/demo-home.png`

## 제약사항과 개선 아이디어
- 관리자 권한 시스템은 MVP 범위에서 제외했고, 로그인 사용자가 문서를 등록할 수 있게 했습니다.
- `TYPEORM_SYNC=true`는 개발 편의 설정입니다. 운영에서는 migration으로 전환해야 합니다.
- `mcp_stdio`는 인터페이스만 두고 mock fallback으로 처리했습니다.
- LangChain 의존성은 npm peer dependency 충돌을 피하기 위해 제외하고, MVP에서는 내부 chunk splitter를 사용했습니다.
- OpenAI 키가 없으면 mock LLM/embedding으로 데모 응답이 생성됩니다.
- 향후 개선: 관리자 role, FAQ 좋아요 API, 문서 중복 갱신, 실제 MCP stdio bridge, e2e 테스트, 배포 파이프라인.
