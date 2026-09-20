# GENERAL 적응형 근거 검색 구현 기록

구현 코드는 `d4192bc`에 함께 커밋했다. 아래 항목은 작업 범위와 실제 검증 결과를 기록한다.

**Goal:** 신규 일반 질문을 하나의 `GENERAL` 경로로 처리하면서 내부 근거 확인 후 질문 성격에 맞는 일회성 웹 검색을 제공한다.

**Architecture:** 질문 분류와 검색 의도를 분리한다. `RagService`의 순위 점수 기반 충분성 판정을 근거 범위 판정으로 바꾸고, `AgentService`가 정상 내부 검색 후 웹 검색 시점을 결정한다. 외부 답변·원문은 기존과 같이 저장하지 않는다.

**Tech Stack:** NestJS, TypeScript, Jest, PostgreSQL/pgvector, OpenAI Chat Completions와 Responses `web_search`.

**Spec:** `docs/superpowers/specs/2026-09-18-general-adaptive-search-design.md`

## Global Constraints

- FAQ와 명시적 GitHub 저장소 분석 경로는 유지한다.
- 내부 검색 장애와 활성 색인 없음은 외부 검색으로 대체하지 않는다.
- `BLOG_SEARCH` 과거 문서는 내부 검색·재색인에서 제외한다.
- 외부 자료와 외부 자료를 사용한 답변은 DB·FAQ·임베딩에 저장하지 않는다.
- 새로운 production 의존성이나 DB 마이그레이션은 추가하지 않는다.

---

### Task 1: 신규 질문 분류와 의도 판별

**Files:** `backend/src/ai/utils/agent-router.ts`, `backend/src/ai/utils/agent-router.spec.ts`, `backend/src/ai/utils/search-intent.ts`, `backend/src/ai/utils/search-intent.spec.ts`

- [x] 신규 정글·일반 질문 모두 `GENERAL`이 되고 FAQ/GitHub는 유지되는 테스트를 작성·실행했다.
- [x] 최근 후기, 일반 후기, 공식 사실, 일반 지식 질문의 의도 판별 테스트를 작성·실행했다.
- [x] 해당 테스트와 backend build를 실행했다.

### Task 2: 내부 근거 충분성

**Files:** `backend/src/ai/evidence-assessment.service.ts`, `backend/src/ai/evidence-assessment.service.spec.ts`, `backend/src/ai/rag.service.ts`, `backend/src/ai/rag-hybrid-search.spec.ts`, `backend/src/ai/ai.module.ts`

- [x] 내부 후보와 근거 판정, 잘못된 모델 응답, 모델 장애의 테스트를 작성·실행했다.
- [x] 질문과 상위 내부 chunk만 모델에 전송하고, 확인된 근거 ID가 있을 때만 충분하다고 판정한다. 기존 `1/61` 기준을 제거했다.
- [x] 판정 장애를 검색 장애 상태로 반환하고 관련 테스트·backend build를 실행했다.

### Task 3: 적응형 웹 검색과 출처 경계

**Files:** `backend/src/ai/agent.service.ts`, `backend/src/ai/agent.service.spec.ts`, `backend/src/ai/web-search.service.ts`, `backend/src/ai/web-search.service.spec.ts`

- [x] `GENERAL` 질문의 내부 검색, 최근 후기의 정상 검색 후 병렬 보강, 다른 질문의 근거 부족 후 검색, 장애·색인 없음 차단 테스트를 작성·실행했다.
- [x] 검색 지시문이 실제 질문의 대상/주제를 사용하고 고정 정글 키워드가 없는지 테스트했다.
- [x] 외부 인용 검증과 미저장, 검색 실패 시 안전한 응답을 유지했다.
- [x] 관련 Jest 테스트와 전체 backend test/build를 실행했다.

### Task 4: 문서와 로컬 검증

**Files:** `README.md`, `docs/rag-retrieval-reliability-improvement-plan.md`, `docs/rag-retrieval-implementation-status.md`, 본 설계·계획 문서

- [x] 실제 동작과 정책을 문서에 반영하고 과거 결정과 바뀐 결정을 날짜로 구분했다.
- [x] backend 테스트 121개 및 backend·frontend 빌드를 통과했다.
- [x] 실제 OpenAI 웹 검색 표본 한 건에서 인용 7개와 질문 속 두 대상 이름을 확인했다. 별도 근거 판정 표본 한 건도 완료했다.
- [ ] 인증된 사용자 질문의 전체 브라우저 왕복, 한국어 검색 품질, 운영 DB·배포·CI는 확인하지 못했다.
- [x] diff·비밀값·Git 상태를 확인하고 코드와 문서를 별도 커밋으로 기록한다.
