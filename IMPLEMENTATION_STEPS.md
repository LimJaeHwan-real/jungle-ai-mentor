# 단계별 구현 및 검증 계획

이 문서는 `PLAN.md`를 실제 구현 작업으로 옮기기 위한 실행 체크리스트다. 구현은 각 단계가 끝날 때마다 빌드 또는 테스트로 검증하고, 외부 키가 없어도 mock/fallback으로 데모가 가능해야 한다.

## 1. 프로젝트 구조
- `backend/`: NestJS, TypeORM, PostgreSQL, pgvector 기반 API 서버
- `frontend/`: React, TypeScript, React Router, Axios, TanStack Query 기반 웹 클라이언트
- `docker-compose.yml`: PostgreSQL + pgvector 개발 DB
- `.env.example`: OpenAI, GitHub, JWT, DB 환경 변수 예시
- `README.md`: 실행 방법, 아키텍처, API, 데모 시나리오, 제약사항

검증:
- 루트에서 `npm.cmd --prefix backend run build`
- 루트에서 `npm.cmd --prefix frontend run build`

## 2. 백엔드 기본 구성
- NestJS 모듈 구조 생성
- TypeORM DataSource 설정
- PostgreSQL과 pgvector 확장 초기화
- 공통 설정, DTO validation, 에러 처리를 구성

검증:
- `backend` 빌드 통과
- `/api/health` 응답 확인

## 3. 인증
- 회원가입, 로그인, 내 정보 조회 API 구현
- bcrypt 기반 비밀번호 해시 저장
- JWT access token 발급 및 인증 가드 적용

검증:
- `POST /api/auth/signup`
- `POST /api/auth/login`
- `GET /api/auth/me`

## 4. 게시판
- 게시글 CRUD
- 댓글 CRUD
- 태그 생성 및 연결
- keyword, type, category, tag 필터
- page/limit 기반 페이지네이션
- 질문/정보공유 게시판 분리

검증:
- 게시글 생성, 목록, 상세, 수정, 삭제
- 댓글 생성, 목록, 수정, 삭제
- 태그 필터와 검색 결과 확인

## 5. RAG 및 FAQ
- 관리자 문서 등록
- 문서 chunk 분할
- OpenAI Embedding 사용 가능 시 embedding 저장
- 키가 없으면 deterministic mock embedding 사용
- pgvector 또는 fallback similarity 검색
- AI 질문 답변 저장
- AI 답변을 공개 FAQ로 발행
- FAQ 목록/상세 조회와 조회수 증가

검증:
- `POST /api/admin/documents`
- `POST /api/ai/ask`
- `POST /api/ai/questions/:id/publish`
- `GET /api/faq`
- `GET /api/faq/:id`

## 6. MCP 및 Agent
- GitHub 분석 MCP service layer 구현
- `MCP_GITHUB_MODE=mock` fallback 응답 제공
- `MCP_GITHUB_MODE=github_api`에서 GitHub REST API 사용
- AgentService가 질문을 분류하고 tool을 선택
- tool 실패 시 전체 답변 실패 대신 fallback 응답

검증:
- `POST /api/mcp/github/analyze`
- `/api/ai/ask`가 `agentRoute`, `usedTools`, `agentState`를 반환

## 7. 프론트엔드
- 홈, 회원가입, 로그인
- AI 질문 페이지
- FAQ 목록/상세
- 게시글 목록/작성/상세/수정
- 댓글 작성/수정/삭제
- 인증 token 저장과 API 연동

검증:
- `frontend` 빌드 통과
- 주요 화면 라우팅 확인

## 8. README 제출 문서
README에는 다음 항목을 반드시 포함한다.
- 프로젝트 개요
- 주요 구현 기능
- 전체 아키텍처
- RAG 기능, 기술, 구조
- MCP 기능, 기술, 구조
- Agent 기능, 기술, 구조
- 실행 방법
- 환경 변수 설정
- 주요 API 테스트 예시
- 데모 스크린샷 또는 스크린샷 위치
- 제약사항과 개선 아이디어

최종 검증:
- `npm.cmd --prefix backend run build`
- `npm.cmd --prefix frontend run build`
- README의 실행 명령과 실제 스크립트 이름 일치 확인
