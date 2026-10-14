# Personal Excalidraw Cloud 로드맵

## 2026-10-13 최신 상태

Milestone 7 공개 서버와 운영 앱 endpoint 전환 완료. 운영 Source `d86d9e27`, version/bundle 반영 확인. 공개 relay 연결 로컬 앱의 Safari/별도 브라우저 양방향 편집과 새로고침 재참여 확인. 운영 자동 브라우저 접근 차단으로 운영 화면은 미검증, 실제 sleep/cold start 뒤 복구도 미검증이다. Milestone 7 전체 검증 완료로 판정하지 않는다. 다음 개발은 Milestone 8 설계이며 아래 기록은 당시 상태다.

## 2026-10-09 현재 상태

Milestone 7 후속: Safari/별도 브라우저 양방향 편집 및 자신의 undo/redo, 서버 재기동 후 편집 재전달 확인. 실행 dependency audit 0건, 다단계 Docker/Render 수동 배포 초안 준비. 공개 서버/운영 전환은 미완료. 재연결 직후 무편집 상태의 일시적 빈 화면 및 개발 도구 경고는 후속으로 유지한다.

사용자 요청으로 심화 안정화 검증은 보류하고 기능 우선으로 전환한다. 미검증 항목은 삭제하지 않으며 Milestone 6 전체 완료로 표시하지 않는다.

### 통합 및 배포 계획

- [x] 현재 기능 브랜치의 새로고침 수정/Workspace/메뉴/검증 기록을 검토하고 커밋한다 (`1a246109`).
- [x] 기능 브랜치를 push하고 Preview 빌드 성공 및 대상 commit 확인. Safari 화면은 Vercel 로그인 보호로 미확인.
- [x] 원격 personal-cloud 최신 상태를 확인한 뒤 fast-forward 통합/push. 강제 push나 DB migration 재실행 없음.
- [x] GitHub Production 배포 success/Source 및 운영 도메인의 version commit 일치, Safari 메뉴 반영 확인. Vercel Dashboard Ready/Current 표기 및 운영 로그인 후 내 그림/저장은 미확인으로 기록한다.

완료 조건: 원격 통합 commit과 실제 배포 Source가 일치해야 운영 반영으로 기록한다. 현재 브랜치의 이전 미통합 기능(이미지 초안/백업/URL 오류 안내)도 포함되므로 마지막 운영 commit과 전체 변경 범위를 확인한다. 심화 장애 검사는 재개하지 않는다.

### Workspace 기능 계획

- [x] 한 단계 폴더 생성/이름 변경/삭제, 그림 이동/미분류, 제목 검색 구현
- [x] 폴더 삭제는 그림/이미지 삭제 없이 분류만 해제. owner와 parent 그림 권한을 DB에서 검사
- [x] additive migration 적용 및 이전 앱 schema 유지, migration 미적용 시 기존 그림 목록 유지 회귀 검사
- [x] 메뉴의 Excalidraw+/Socials/Sign up/Visual Debug만 숨기고 개인 로그인/내 그림/내보내기/협업 유지
- [x] 기본 typecheck/scoped lint/관련 테스트/build 및 Safari 메뉴/목록/검색 화면 확인. 심화 장애 검사는 후속으로 보류

Milestone 0~5 기반 구현 완료, Milestone 6 심화 안정화 검증 보류, Milestone 7 로컬 서버 구현 완료/공개 배포 준비 단계다. 아래 날짜별 기록은 당시 상태이며 최신 판정은 이 요약과 VALIDATION의 최신 항목을 따른다. 새로고침 초기화 경합/Workspace 수정은 운영 배포했고 자체 협업 서버는 아직 운영 전환하지 않았다.

- 완료: 로그인/내 그림/자동 저장/이미지, 버전 복원, 현재 그림 파일 백업, Safari 탭 한정 업로드 실패 후 초안 복구와 재업로드
- 후속 수정 완료: URL 새로고침의 빈 캔버스 (D-016, 실제 편집기 회귀 검사 및 2026-10-09 Safari 반복 새로고침/새 탭 이미지 확인)
- 후속 검증 완료: Safari URL 통신 실패 안내/Cloud 연결 해제/정상 재열기, rollback SQL의 DB RLS 13항목
- 후속 접근 검증 완료: 실제 두 계정의 같은 TEST 파일 Storage HTTP 다운로드 비교/다른 계정 metadata 0행
- 후속 쓰기 검증 완료: DB metadata CRUD/owner/parent 검사, 실제 두 계정 Storage 생성/덮어쓰기/삭제 격리 및 합성 TEST PNG 정리
- 남은 검증: 실제 JWT metadata 쓰기/서명 URL, 프로세스 강제 종료/eviction 및 미완료 transaction의 한계 확인, 서로 다른 local scene 두 탭/느린 로컬 파일 응답
- 후속 기능: 폴더/검색 Workspace 운영 반영. Milestone 7 로컬 서버 구현 후 공개 호스팅/브라우저 확인을 진행하고 Milestone 8~11의 협업 persistence/AI/Local LLM/MCP로 이어간다.
- 종료 기준: 새로고침 문제를 수정·재검증하고 미검증 범위를 명시한 뒤 Milestone 6 종료 여부를 판정한다. 모든 테스트 완료 또는 최신 코드 운영 배포로 표시하지 않는다.

### 2026-10-09 URL 오류 및 권한 후속 검증 계획

- [x] Safari 테스트 탭에서 drawing GET 실패 시 URL 자동 열기 오류 안내/Cloud 연결 해제와 정상 재열기를 확인한다.
- [x] 테스트 데이터만 대상으로 RLS 쓰기/Storage 정책의 rollback 기반 검사 SQL을 준비한다.
- [x] Safari 관리자 SQL Editor에서 DB 정책 13항목과 rollback 뒤 보존 4항목을 확인한다.
- [x] 실제 두 로그인 계정의 같은 TEST 파일 Storage HTTP 다운로드 비교. 소유자 nonempty 성공/다른 계정 bytes 없음과 Object not found, metadata 0행을 확인했다. 읽기 전용이며 인증값/이미지 본문을 기록하지 않는다.
- [x] 파일 metadata 쓰기 검사는 rollback 방식으로 확인했다. 후속 13항목/보존 5항목 통과, 실제 Storage HTTP 쓰기와 구분한다.

### 파일 쓰기 후속 검사 계획

- [x] TEST 복원본의 metadata INSERT/UPDATE/DELETE 소유자 positive control과 다른 사용자 차단을 DB authenticated 역할에서 검사한다.
- [x] owner 변경 및 다른 사용자의 parent drawing 연결은 42501로 거부되는지 확인한다. 실제 존재하는 다른 사용자 ID를 transaction 안에서만 사용해 FK 실패와 구분한다.
- [x] 모든 DB 쓰기는 subtransaction과 전체 rollback으로 취소하고 기존 metadata 보존을 확인한다.
- [x] 실제 Storage HTTP 생성/덮어쓰기는 원본/버전에서 참조하지 않는 신규 TEST PNG 한 개만 사용했다. 소유자 성공/다른 계정 RLS 거부 확인. 기존 파일은 덮어쓰거나 삭제하지 않았다.
- [x] 승인된 TEST PNG 삭제 검사/정리 완료. 다른 계정 remove 0개, 소유자 remove 1개, 목록 부재 및 cacheNonce/no-store 요청의 404 확인. 원본 제목/수정 시각/이미지 보존, 임시 context 제거 확인.

완료 조건: 결과 이름/boolean만 출력하며 실제 scene/계정/파일 본문을 fixture에 넣지 않는다. DB 역할 검사를 실제 두 JWT의 Storage HTTP 쓰기 검사로 표기하지 않는다. migration/영구 권한 변경은 없다.

완료 조건: 통신 오류를 권한 거부로 오인하지 않는다. 캔버스 보존은 별도 회귀 검사로 확인한다. 테스트 요청 차단은 탭 종료/복구로 제거한다. RLS 검사는 BEGIN/ROLLBACK 안에서 TEST 복원본 하나의 소유자와 임시 사용자 ID만 사용하며 영구 데이터 변경/정책 변경/secret 출력은 하지 않는다. DB 역할/claims 기반 정책 검사는 다른 계정 JWT의 HTTP Storage 서비스 검사와 구분한다.

## 목표

공개 Excalidraw를 기반으로 기존 local-first 기능을 유지하면서 다음 기능을순차적으로 추가한다.

```text
로그인
  -> 내 그림 목록
  -> 문서별 로컬 초안
  -> 자동 Cloud Save
  -> 여러 기기 동기화
  -> 자체 공동편집 인프라
  -> AI Gateway / Local LLM
  -> MCP / Codex 연동
```

MVP 범위는 로그인, 그림 목록, 자동 저장, 이미지 복원, 여러 기기 동기화까지다. 공동편집, AI, MCP는 MVP 이후에 진행한다.

## 핵심 원칙

1. `master`는 upstream 추적용으로 깨끗하게 유지한다.
2. 개인 기능은 `personal-cloud`와 기능 브랜치에서 개발한다.
3. `packages/excalidraw` 수정은 최소화하고 `excalidraw-app`에 adapter 형태로 추가한다.
4. 기존 익명 local-first 편집과 Export 기능을 유지한다.
5. Cloud Save와 Live Collaboration은 별도 기능으로 개발한다.
6. 사용자 소유 데이터에는 반드시 RLS를 적용한다.
7. 브라우저에 service role key나 AI provider secret을 넣지 않는다.
8. AI/Codex 변경 전에는 version snapshot을 생성한다.

## 현재 기준선

기준일: 2026-08-11

- [x] 공식 Excalidraw 저장소 Fork
- [x] 개인 노트북에 Clone
- [x] `origin`이 개인 Fork를 가리킴
- [x] 작업 트리가 깨끗한 `master` 상태
- [x] 공식 저장소를 `upstream`으로 등록
- [x] Yarn 1.22.22 준비
- [x] 의존성 설치
- [x] 원본 앱 실행 및 기본 편집/로컬 복구 확인
- [x] 원본 앱 빌드 확인
- [x] 코딩 에이전트 작업 규칙과 자동 guardrail 구성

현재 확인된 환경:

```text
origin: https://github.com/tlsrltjq/excalidraw.git
Node:   v24.16.0
Yarn:   미설치
Port:   3001 (.env.development)
```

## Milestone 0: Baseline

목적은 개인 기능을 추가하기 전 정상 동작 기준점을 확보하는 것이다.

- [x] `upstream` remote 등록
- [x] `origin`과 `upstream` 확인
- [x] Yarn 1.22.22 준비
- [x] `yarn install`
- [x] `yarn start`
- [x] 캔버스 렌더링 확인
- [x] 사각형 생성 확인
- [x] 텍스트와 화살표 생성 확인
- [x] PNG/SVG Export 화면과 관련 자동 테스트 확인
- [x] 실제 PNG/SVG/Excalidraw 파일 다운로드 확인
- [x] 새로고침 후 로컬 복구 확인
- [x] `yarn test:typecheck`
- [x] `yarn test:code`
- [x] `yarn test:app --watch=false`
- [x] `yarn build`
- [x] `node personal-cloud-harness/check-guardrails.mjs`

완료 조건: 수정하지 않은 upstream 앱이 로컬에서 실행되고 빌드된다.

### Baseline 검증 기록

2026-08-11:

- `master`와 `upstream/master`가 동일한 commit임을 확인했다.
- Yarn 1.22.22로 frozen lockfile 설치를 완료했다.
- 개발 서버 `http://127.0.0.1:3001/` 기동을 확인했다.
- 브라우저에서 사각형 생성 후 새로고침해 로컬 복구를 확인했다.
- 브라우저에서 텍스트와 화살표 생성, PNG/SVG Export 화면을 확인했다.
- 사용자가 실제 PNG/SVG/Excalidraw 파일 다운로드를 확인했다.
- 브라우저 console error는 0건이었다.
- TypeScript typecheck, ESLint, 전체 Vitest, production build가 성공했다.
- Vitest 결과는 121 files, 1,858 tests 통과, 47 skipped, 1 todo다.
- upstream dependency peer warning, 오래된 Browserslist DB, 큰 bundle chunk 경고가 있다.

## Milestone 1: Branch와 Baseline 배포

- [x] `personal-cloud` 브랜치 생성
- [x] 개인 Fork에 브랜치 push
- [x] Vercel 프로젝트 연결 (`personal-excalidraw`, source: `personal-cloud`)
- [x] Production Branch를 `personal-cloud`로 설정 (Environment: Production, Current)
- [x] 배포 주소에서 자동화 브라우저로 렌더링/폰트/PWA/Export 확인 (아래 기록)
- [x] PC와 iPad 실제 브라우저에서 최종 확인 (사용자 확인, 2026-08-19)
- [x] Local Save를 실제 foreground 탭에서 확인 (사용자 확인, 2026-08-19)
- [x] `vercel.json`의 upstream 전용 redirect/header 검토 (D-010: 현재는 무해하므로 미변경)

배포 주소 (2026-08-19 확인):

```text
Production: https://personal-excalidraw.vercel.app
```

### 2026-08-19 배포 주소 자동 확인 기록

Claude Code 브라우저 도구로 `https://personal-excalidraw.vercel.app`을 직접 열어 확인했다.

- 캔버스 렌더링, 한글 UI, Virgil 로고 폰트 정상.
- 사각형 생성/선택 정상, console error 없음 (`Feature-Policy: *` 헤더에 대한 브라우저 경고만 존재 — `vercel.json`의 upstream 전용 값, D-010 참고).
- 메뉴 → 이미지 내보내기 다이얼로그 정상 (PNG/SVG 미리보기, 배경/다크모드/크기 옵션 정상). 실제 파일 다운로드는 사용자 승인이 필요한 동작이라 실행하지 않음.
- PWA: `/manifest.webmanifest` 200 응답, `sw.js` service worker 등록 확인.
- **Local Save는 이 자동화 브라우저로 검증 불가**: 이 브라우저 pane은 `document.hidden === true`(background tab 취급)를 보고하고, `LocalData.isSavePaused()`가 `document.hidden || locker.isLocked()`를 체크하므로 저장이 항상 스킵된다. 로컬 dev 서버(`yarn start`)에서도 동일 현상을 재현했고, `document.hidden`을 스크립트로 강제로 `false`로 바꾸자 즉시 `excalidraw`/`excalidraw-state` 키가 정상 저장됐다. 즉 저장 로직 자체는 정상이며, 이번에 발견한 건 자동화 브라우저 도구의 한계다 (실사용자의 foreground 탭에서는 재현되지 않음).
- 결론: 렌더링/폰트/PWA/Export는 자동 확인 완료. **Local Save와 PC/iPad 실기기 확인은 사용자가 직접** 배포 주소에서 사각형을 그리고 새로고침해 복구되는지 확인해야 로드맵 체크리스트를 완전히 닫을 수 있다.

### 2026-08-19 사용자 실기기 확인 기록

사용자가 실제 PC/iPad 브라우저에서 배포 주소를 열어 확인했다. Local Save(새로고침 후 복구)와 파일 다운로드(PNG/SVG/Excalidraw export) 모두 문제없이 동작했다. 이로써 Milestone 1의 남은 항목이 모두 닫혔다.

**완료 조건 충족**: 노트북이 꺼져도 배포된 원본 Excalidraw에 접속할 수 있다.

CORS는 같은 origin 앱을 보호하는 설정이 아니다. 전역 `Access-Control-Allow-Origin`을 개인 배포 URL로 단순 치환하지 않고 실제로 cross-origin 접근이 필요한 asset에만 설정한다.

완료 조건: 노트북이 꺼져도 배포된 원본 Excalidraw에 접속할 수 있다.

## Milestone 2: Supabase 기반과 인증

- [x] Supabase 프로젝트 생성 (사용자가 직접 생성. project: `personal-excalidraw`, org: `tlsrltjq's Org`, region: Seoul)
- [x] SQL migration 디렉터리 추가 (`supabase/migrations/README.md`, 컨벤션만 — Milestone 3부터 실제 테이블)
- [x] `@supabase/supabase-js`를 `excalidraw-app` workspace에 추가 (2.112.3)
- [x] Supabase client와 환경변수 타입 추가 (`excalidraw-app/cloud/supabaseClient.ts`, `vite-env.d.ts`)
- [x] Google OAuth 로그인/로그아웃 구현 (`excalidraw-app/components/cloud/CloudAuthMenuItems.tsx`, 메인 메뉴에 통합)
- [x] session restore 구현 (`excalidraw-app/cloud/session.ts` — `getSession` + `onAuthStateChange`)
- [x] 익명 사용자의 기존 local-first 편집 유지 (아래 코드 레벨 확인 기록)
- [x] OAuth redirect URL을 개발/운영 주소로 제한 (Site URL:
  `https://personal-excalidraw.vercel.app`; Redirect URLs: `http://localhost:3001`,
  `https://personal-excalidraw.vercel.app` — 와일드카드 없이 정확한 origin만 등록,
  사용자 확인 완료 2026-08-19)

프론트엔드 허용 환경변수:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
```

완료 조건: 로그인과 로그아웃 후에도 익명/로그인 사용 흐름이 각각 정상이다.

### 2026-08-19 코드 스캐폴딩 진행 기록

Supabase 프로젝트가 아직 없는 상태에서 계정/인증이 필요 없는 부분부터 먼저 구현했다.

- `supabase/migrations/README.md`: migration 파일명 규칙, RLS를 같은 파일에서 함께
  작성하는 규칙, `check-guardrails.mjs`가 RLS 누락을 감지한다는 점을 기록.
- `excalidraw-app/package.json`에 `@supabase/supabase-js@2.112.3` 추가, `yarn install` 완료.
- `excalidraw-app/vite-env.d.ts`에 `VITE_SUPABASE_URL?`, `VITE_SUPABASE_PUBLISHABLE_KEY?`를
  **optional**로 추가했다. Cloud 환경변수가 없어도 타입 에러 없이 앱이 동작해야 하기 때문이다.
- `excalidraw-app/cloud/supabaseClient.ts`: 두 환경변수가 모두 있을 때만 client를 생성하고,
  없으면 `supabase = null` + `isCloudConfigured = false`로 fail-soft 처리한다. 모든 Cloud
  모듈은 이 값을 null-check 하고 절대 throw하지 않아야 한다 (AGENTS.md 변경 경계 참고).
- `excalidraw-app/cloud/session.ts`: `useCloudSession()` 훅이 `supabase.auth.getSession()`으로
  세션을 복원하고 `onAuthStateChange` 구독을 유지한다. React Strict Mode에서 effect가
  다시 실행돼도 안전하도록 cleanup에서 `subscription.unsubscribe()`와 `cancelled` guard를 둔다
  (ENGINEERING_GUARDRAILS.md #10). `signInWithGoogle()`, `signOut()`도 여기서 export한다.
- `excalidraw-app/components/cloud/CloudAuthMenuItems.tsx`: 메인 메뉴(`AppMainMenu.tsx`)의
  "캔버스 초기화" 바로 다음에 추가. `isCloudConfigured`가 `false`이거나 세션 로딩 중이면
  `null`을 반환해 기존 메뉴에 어떤 항목도 추가하지 않는다.
- **로컬 dev 서버로 확인**: Cloud 환경변수가 없는 상태에서 앱이 정상 기동하고, 콘솔에
  `[personal-cloud] ... Cloud auth is disabled, running in anonymous local-first mode.`
  info 로그만 찍히며, 메인 메뉴를 열어도 로그인 관련 항목이 전혀 보이지 않아 기존 익명
  local-first 흐름이 그대로 유지됨을 확인했다 (D-004 충족).
- `yarn test:typecheck`, `yarn fix`(prettier + eslint --fix) 통과.
- **아직 실제 로그인은 검증하지 못했다**: Supabase 프로젝트가 없어 `signInWithGoogle()` /
  `signOut()` 자체의 실제 OAuth 흐름과 session restore는 테스트하지 않았다. 사용자가
  Supabase 프로젝트를 만들고 Google OAuth provider를 켠 뒤 아래를 전달하면 이어서
  진행한다:
  - `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (publishable/anon key — RLS로
    보호되므로 공개돼도 안전하다. `.env.development`/`.env.production`에 커밋해도 된다.)
  - Supabase Dashboard → Authentication → URL Configuration에서 Site URL/Redirect URLs에
    `http://localhost:3001`과 `https://personal-excalidraw.vercel.app`을 등록해야 한다.
  - Google Cloud Console에서 OAuth client의 Authorized redirect URI에 Supabase가 제공하는
    콜백 URL(`https://<project-ref>.supabase.co/auth/v1/callback`)을 등록해야 한다.

### 2026-08-19 Supabase 프로젝트 생성 + 리다이렉트 확인

사용자가 Supabase 프로젝트(`personal-excalidraw`, Seoul, "Automatically expose
new tables" 해제 + "Enable automatic RLS" 활성화)를 생성했다. `.env.local`
(gitignored, 리포 루트)에 실제 `VITE_SUPABASE_URL`과 `VITE_SUPABASE_PUBLISHABLE_KEY`를
채워넣었다 — 이 값들이 저장된 위치는 Claude 메모리에도 기록해 다음 세션에서 재입력을
요구하지 않게 했다. secret key(admin/service-role 동급)는 어디에도 저장하지 않았다 —
브라우저 인증 흐름에는 필요 없다.

로컬 dev 서버에서 확인:

- Cloud 환경변수가 채워지자 메인 메뉴에 "Google로 로그인" 항목이 정확히 나타났다
  (설정 전에는 항목 자체가 없었던 것과 대비됨 — `isCloudConfigured` 분기 정상 동작 확인).
- 클릭 시 `signInWithGoogle()`이 Supabase authorize 엔드포인트
  (`https://dtptyzwjhvuvrsguspic.supabase.co/auth/v1/authorize?provider=google&redirect_to=...`)로
  정확히 리다이렉트했다. 즉 client 설정, 메뉴 연결, redirect 로직까지 코드 경로는
  전부 정상이다.
- 거기서 `{"code":400,"error_code":"validation_failed","msg":"Unsupported provider: provider is not enabled"}`
  에러를 받았다 — 예상된 지점이다. Supabase Dashboard에서 아직 Google provider를
  켜지 않았기 때문이다.

**남은 것 (사용자가 직접 — OAuth 앱 등록/계정 인증은 에이전트가 대신할 수 없음)**:

1. Google Cloud Console → OAuth client ID(Web application) 생성, Authorized
   redirect URI에 `https://dtptyzwjhvuvrsguspic.supabase.co/auth/v1/callback` 등록.
2. Supabase Dashboard → Authentication → Sign In / Providers → Google 활성화,
   Client ID/Secret 입력.
3. (권장) Authentication → URL Configuration에 `http://localhost:3001`,
   `https://personal-excalidraw.vercel.app` 등록 — 이게 되면 로드맵의 "OAuth
   redirect URL을 개발/운영 주소로 제한" 항목도 닫힌다.
4. 완료되면 다시 로그인을 시도해 실제 Google 계정 선택 화면까지 뜨는지, 로그인 후
   메뉴가 "로그아웃"으로 바뀌는지, 새로고침 후에도 로그인 상태가 유지되는지
   (session restore) 확인한다.

### 2026-08-19 Google provider 활성화 + 실제 로그인/로그아웃 확인

사용자가 Google Cloud Console에서 OAuth client(Web application, redirect URI:
`https://dtptyzwjhvuvrsguspic.supabase.co/auth/v1/callback`)를 만들고,
Supabase Dashboard → Authentication → Providers → Google에 Client ID/Secret을
입력한 뒤 활성화했다.

Claude Code 브라우저로 재확인: 로그인 메뉴 클릭 시 이전의 400 에러 대신 실제
Google 계정 로그인 화면(`accounts.google.com`)까지 정상적으로 도달했다
("dtptyzwjhvuvrsguspic.supabase.co(으)로 이동" 문구로 콜백 대상도 정확함을
확인). 이후 실제 계정 로그인은 에이전트가 대신할 수 없어 사용자가 직접
진행했다.

사용자 확인 결과: **로그인 성공, 로그아웃 시 메뉴가 다시 "Google로 로그인"으로
정상 복귀함.** Milestone 2의 완료 조건("로그인과 로그아웃 후에도 익명/로그인
사용 흐름이 각각 정상")을 충족했다.

남은 항목은 "OAuth redirect URL을 개발/운영 주소로 제한" 하나뿐이다 —
Supabase Authentication → URL Configuration에서 Site URL/Redirect URLs를
`http://localhost:3001`, `https://personal-excalidraw.vercel.app`로 명시적으로
제한했는지는 아직 사용자가 확인하지 않았다. 지금 상태로도 로그인은 동작했지만,
redirect URL을 열어두면(와일드카드 등) 다른 도메인으로 세션 토큰이 새어나가는
open-redirect 위험이 있으므로 프로덕션 배포 전에는 반드시 좁혀야 한다.

### 2026-08-19 URL Configuration 확인 — Milestone 2 완료

원래 Site URL이 기본값 `http://localhost:3000`(실제 dev 포트 3001과도 다르고
배포 주소도 아님)으로 방치돼 있었고 Redirect URLs는 비어 있었다. 아래로
수정하고 사용자가 저장/새로고침까지 확인했다:

- Site URL: `https://personal-excalidraw.vercel.app`
- Redirect URLs: `http://localhost:3001`, `https://personal-excalidraw.vercel.app`
  (와일드카드 미사용, 정확한 origin 2개만 등록)

Milestone 2 체크리스트 전 항목이 완료됐다. **완료 조건 충족**: 로그인과
로그아웃 후에도 익명/로그인 사용 흐름이 각각 정상이다.

## Milestone 3: Cloud Workspace

- [x] `drawings` table과 RLS migration 작성 (SQL 작성 완료, 실제 DB 적용은 사용자가
  SQL Editor에서 실행해야 함 — 아래 기록)
- [x] 그림 생성, 목록, 이름 변경, 삭제 API 작성 (`excalidraw-app/cloud/drawings.ts`)
- [x] Dashboard 구현 (`excalidraw-app/components/cloud/Dashboard.tsx`, 메인 메뉴
  "내 그림"에서 열림, 로그인 시에만 노출)
- [x] URL에 현재 `drawingId` 표현 (D-006: `?drawing=<uuid>`,
  `excalidraw-app/cloud/urlDrawingId.ts`)
- [x] 새 그림의 유효한 초기 Excalidraw scene 생성 (`serializeAsJSON([], ..., "database")`
  기반, 임의 JSON 아님)
- [x] Cloud scene 로딩 시 Excalidraw restore API 사용 (`restoreElements`/
  `restoreAppState` + `updateScene({ captureUpdate: IMMEDIATELY })`, 기존
  `initializeScene`의 backend-import 패턴과 동일)
- [x] 다른 사용자의 drawing 접근 차단 UI 테스트 (2026-09-29 및 2026-10-04 두 계정 확인; 직접 Storage/쓰기 RLS 검사는 별도)

### 2026-08-19 실사용 테스트 중 발견한 버그 2건 + 수정

1. **`origin/personal-cloud`에 push가 안 돼 있었음**: Milestone 2/3 커밋을 전부
   로컬에만 만들어두고 push를 안 해서, Vercel Production은 계속 Milestone 1
   상태(`585dfab`)로 빌드되고 있었다. 그래서 배포 주소에 "Google로 로그인"
   메뉴 자체가 없었다. `git push origin personal-cloud`로 해결. **교훈: 이
   프로젝트에서는 커밋 후 바로 push까지 한다** (배포 지연을 막기 위해).
2. **`.env.local`은 Vercel 빌드에 안 들어감**: `.env.local`은 의도적으로
   gitignore돼 있어서 로컬 dev 서버에서만 보이고, Vercel은 git 저장소만 보고
   빌드하므로 프로덕션 빌드에 Cloud 환경변수가 전혀 없었다. Vercel Dashboard →
   Settings → Environment Variables에 `VITE_SUPABASE_URL`,
   `VITE_SUPABASE_PUBLISHABLE_KEY`를 Production 환경으로 직접 등록(사용자가
   git과 무관하게 직접 입력)하고 Redeploy해서 해결.
3. **`permission denied for table drawings`**: Supabase 프로젝트 생성 시
   "Automatically expose new tables"를 껐기 때문에, RLS policy와는 별개로
   `authenticated` 역할에 테이블 GRANT가 없어서 모든 요청이 RLS 평가 전에
   막혔다. `supabase/migrations/20260819140000_grant_drawings_table.sql`로
   `grant select, insert, update, delete on public.drawings to authenticated;`
   추가해 해결.

추가로, 사용자 요청으로 **"현재 캔버스를 새 그림으로 저장"** 버튼을 Dashboard에
추가했다 (`createDrawing`이 이제 기존 scene을 받아 그걸로 새 row를 만들 수
있음). 이건 수동 1회성 저장이고, autosave(같은 그림을 계속 갱신)는 아직 아니다
— 그건 Milestone 4다.

**사용자 확인**: 위 수정 후 그림 저장/목록/이름변경/열기/삭제 전체 흐름이
정상 동작함을 확인했다 (2026-08-19). 남은 건 다른 계정으로 RLS 교차 테스트뿐이다.

권장 초기 schema:

```text
drawings
├── id
├── owner_id
├── title
├── scene_data
├── revision
├── created_at
└── updated_at
```

`owner_id`는 가능하면 DB에서 `auth.uid()`를 기본값으로 설정해 클라이언트가임의 사용자 ID를 전달하지 않게 한다.

완료 조건: 로그인한 사용자가 본인 그림만 생성하고 열고 삭제할 수 있다.

### 2026-08-19 Milestone 3 코드 구현 기록

계정/DB 적용이 필요 없는 부분(설계 결정, 코드)을 먼저 구현했다.

- **D-005 결정** (`personal-cloud-docs/DECISIONS.md`): scene은 RLS로 보호된
  PostgreSQL에 평문 저장 (선택지 A). Milestone 9(AI Gateway)/11(MCP)이 scene을
  읽고 조작해야 하므로 클라이언트 암호화(B)는 그 경로를 막는다.
- **D-006 결정**: `?drawing=<uuid>` query parameter. `excalidraw-app`에 router가
  없어 path route(`/drawings/<uuid>`)는 새 dependency + `vercel.json` rewrite가
  필요해 범위가 커진다. 기존 예약 흐름(`?id`, `#json=`, `#room=`, `#url=`)과
  충돌 없음.
- `supabase/migrations/20260819130357_create_drawings_table.sql`: `drawings`
  table, RLS enable, select/insert/update/delete 4개 policy(모두
  `auth.uid() = owner_id`), `updated_at` 자동 갱신 trigger를 한 파일에 작성.
  `check-guardrails.mjs`가 RLS 관련 경고 없이 통과함을 확인했다.
- `excalidraw-app/cloud/types.ts`, `drawings.ts`: `listDrawings`,
  `createDrawing`, `renameDrawing`, `deleteDrawing`, `getDrawing`. 전부
  Cloud 미설정 시 명시적으로 throw하고(호출자가 처리), `owner_id`는 절대
  클라이언트에서 설정하지 않는다 — DB 컬럼 default(`auth.uid()`)에 맡긴다.
- `excalidraw-app/cloud/urlDrawingId.ts`: `location.search`의 `drawing` 파라미터만
  다루고 hash는 건드리지 않는다.
- `excalidraw-app/components/cloud/Dashboard.tsx`: 목록/생성/이름변경/삭제/열기
  다이얼로그. 로그인 안 됐거나 다이얼로그가 닫혀 있어도, 로그인 상태가 확인되고
  URL에 `?drawing=`이 있으면 자동으로 그 그림을 불러온다(딱 한 번, silent) —
  D-006에서 URL로 표현하기로 한 것을 실제로 의미 있게 만드는 부분이다.
- `excalidraw-app/components/AppMainMenu.tsx`: 로그인 시에만 "내 그림" 메뉴 항목
  추가 (`CloudAuthMenuItems.tsx`).
- **리팩터링**: Milestone 2의 `useCloudSession()`이 컴포넌트마다 각자
  `getSession`/`onAuthStateChange` 구독을 새로 만들던 걸, Dashboard도 세션이
  필요해지면서 모듈 스코프에서 단 한 번만 구독하도록 `excalidraw-app/cloud/session.ts`를
  정리했다 (여러 컴포넌트가 같은 구독을 나눠 쓰는 게 아니라 각자 만드는 중복을
  없앰).
- **검증**: `yarn test:typecheck`, `yarn test:code`(eslint), `yarn test:app`
  (121 files, 1858 tests, 베이스라인과 동일) 전부 통과. 로컬 dev 서버에서 로그인
  안 된 상태로 메뉴를 열어 "내 그림" 항목이 없고 console error도 없음을 확인—
  로그인/DB가 필요한 실제 생성·목록·열기·삭제 흐름과 "다른 사용자의 drawing
  접근 차단 테스트"는 migration을 실제 DB에 적용하고 사용자가 로그인해야 확인
  가능하다.

**남은 것 (사용자가 직접)**:

1. Supabase Dashboard → SQL Editor에
   `supabase/migrations/20260819130357_create_drawings_table.sql` 내용을
   붙여넣어 실행 (또는 Supabase CLI로 `supabase db push`).
2. 배포 주소 또는 localhost에서 로그인 → 메뉴 "내 그림" → 새 그림 만들기 →
   목록에 뜨는지 → 이름 변경 → 열기(그림이 캔버스에 로드되는지) → 삭제까지
   전체 흐름 확인.
3. (권장) 두 번째 Google 계정으로 로그인해서 첫 번째 계정의 그림이 안 보이는지
   확인 — RLS가 실제로 막는지 검증.

## Milestone 4: 문서별 로컬 초안과 Cloud Save

Cloud Save 구현 전 문서별 로컬 초안을 먼저 만든다. 현재 upstream 로컬 저장은하나의 장면을 고정 key에 저장하므로 여러 Cloud 문서를 그대로 연결하면 안 된다.

문서별로 관리할 상태:

```text
drawingId
remoteRevision
localDraft
lastSavedHash
loadState
saveState
```

- [x] IndexedDB에 `drawingId`별 scene 초안 저장 (`cloud/localDraftStore.ts`,
  `idb-keyval` 재사용, 기존 anonymous local-first storage와 별도 DB)
- [x] 문서 전환 중 autosave 일시 정지 (`cloud/autosave.ts`의 `Locker` 기반
  `pauseAutosave`/`resumeAutosave`, 기존 `excalidraw-app/data/Locker.ts` 재사용)
- [x] `serializeAsJSON(..., "database")` 재사용 (모든 scene 비교/저장 지점에서)
- [x] 직렬화 결과 비교로 실제 변경만 저장 (hash 대신 직렬화된 JSON 문자열
  자체를 비교 — 충돌 위험이 없고 어차피 전송할 문자열이라 계산 낭비도 없음)
- [x] debounce (로컬 초안 300ms / Cloud 저장 2000ms — 가이드 범위 1.5~2.5초 안)
- [x] 한 문서당 단일 저장 요청만 실행하고 최신 변경을 후속 저장으로 합치기
  (`latestSnapshot` + `inFlight`/`retryQueued`)
- [x] `revision` 조건부 UPDATE 구현 (`updateDrawingScene` — PostgREST
  `.eq("id", id).eq("revision", expected)` chained filter, RPC 없이 원자적)
- [x] 충돌 감지 시 원격 로드/복사본 저장/덮어쓰기 UI 제공 (D-007,
  `CloudSaveStatus.tsx`)
- [x] 저장 실패 시 로컬 초안 보존 (성공 응답을 받을 때만 `clearLocalDraft` 호출)
- [x] blur, 문서 전환, 로그아웃에서 저장 flush (`flushAutosave()`를
  기존 `visibilityChange`/`onUnload`/`beforeunload` 핸들러, `openCloudDrawing`/
  `adoptCloudDrawing`, `signOut()`에 연결)
- [x] 저장 중/저장됨/실패/오프라인 상태 표시 (`CloudSaveStatus.tsx` 좌하단 pill)
- [x] 공동편집 중 Cloud autosave 비활성화 (`App.tsx`의 `onChange`에서
  `!collabAPI?.isCollaborating()` 체크 — 기존 `LocalData.save` 게이팅과 동일 지점)

추가로 구현한 것 (가이드에 명시되진 않았지만 guardrail #8을 실제로 완성하는 데
필요했던 부분): 그림을 열 때 IndexedDB에 서버 버전과 다른 로컬 초안이 남아있으면
"로컬 변경 사용 / 서버 버전 사용" 프롬프트를 띄운다 (`openDrawing.ts`의
`checkForNewerLocalDraft`, `localDraftPromptAtom`) — 로컬 초안을 만들어만 두고
저장 실패 후 아무도 다시 보여주지 않으면 사실상 유실과 같기 때문이다.

완료 조건: 네트워크 오류나 충돌이 발생해도 마지막 로컬 변경을 잃지 않는다.

### 2026-08-19 구현 및 자체 검증 기록

- `yarn test:typecheck`, `yarn test:code`(eslint), `yarn test:app`
  (121 files, 1858 tests, 베이스라인과 동일), `node personal-cloud-harness/check-guardrails.mjs`
  전부 통과.
- 로컬 dev 서버로 확인: 앱 정상 기동, console error 없음, 로그인 안 된 상태에서
  기존 anonymous local-first 흐름(local storage 복구 등)과 메뉴가 그대로 동작.
  로그인 버튼이 실제 Google 로그인 화면까지 정상 도달함을 재확인(리팩터링 후에도
  깨지지 않음).
### 2026-08-20 사용자 실사용 확인

migration 적용 후 실제 배포 주소에서 확인:

- ✅ 그림을 열고 편집하면 "저장 중… → 저장됨"으로 바뀐다.
- ✅ 같은 계정으로 다른 브라우저/기기에서 대시보드 → 같은 그림 클릭 시 최신
  내용을 불러온다.
- ✅ "로컬 변경 사용 / 서버 버전 사용" 프롬프트가 실제로 재현됐다 (다른
  환경에서 아직 서버에 반영 안 된 로컬 초안이 있는 상태로 그림을 다시 열었을
  때) — 의도한 대로 로컬 변경을 잃지 않고 선택지를 물어봤다.
- 사용자가 "실시간 동기화(라이브 협업)"를 기대했다가 없다는 걸 확인 — 이건
  의도된 범위다. 지금 있는 건 "편집 → 자동 저장, 다시 열면 최신본"이고, 두
  세션이 동시에 열려 있을 때 상대방 변경이 화면에 바로 반영되는 라이브
  협업은 Milestone 7~8(자체 공동편집 서버) 범위다.

**아직 확인 안 된 것** (재현하려면 의도적으로 시나리오를 만들어야 함):
- revision 충돌 UI (같은 그림을 두 탭에서 동시에 편집) — 3가지 선택지
  (원격 새로고침/복사본으로 저장/덮어쓰기) 각각 동작
- 오프라인 → 온라인 복귀 시 자동 저장 및 "오프라인" 상태 표시

## Milestone 5: 이미지와 파일

- [x] private Storage bucket 생성 (migration SQL 작성 완료, 실제 DB 적용은
  사용자가 SQL Editor에서 실행해야 함 — 아래 기록)
- [x] 경로를 `<owner>/<drawing>/<file>`로 제한 (D-011)
- [x] `drawing_files` table과 RLS 작성
- [x] 파일의 drawing 소유권을 DB 정책에서 검증 (`drawing_files` insert/update
  policy의 `EXISTS` 서브쿼리)
- [x] BinaryFileData를 업로드 가능한 binary로 변환 (`dataURLToFile`)
- [x] 로딩 시 BinaryFileData와 data URL 복원 (`getDataURL`)
- [x] 신규/변경 파일만 업로드 (`FileManager`의 버전 기반 dedup 재사용)
- [x] 삭제된 파일 정리 정책 작성 (D-011 "Orphan file 정리 정책" — 설계만,
  실행 인프라(cron/Edge Function)는 별도 작업으로 의도적으로 미룸)
- [x] 이미지 업로드 및 다른 환경에서 복원 확인 (사용자 확인, 2026-08-20 —
  이미지 붙여넣기 후 저장, 다른 브라우저/기기에서 같은 그림을 열어 정상 표시)
- [x] PNG/SVG Export에 이미지 포함 확인 (2026-10-04 Safari 실제 다운로드/복원)

완료 조건: 이미지가 포함된 그림도 다른 기기에서 동일하게 열린다. **충족.**

### 2026-08-19/20 구현 기록

계정/DB 적용이 필요 없는 부분을 먼저 구현했다 (Milestone 2/3/4와 같은 패턴).

- **D-011 결정**: `drawing-files` private bucket, 경로
  `<owner_id>/<drawing_id>/<file_id>`, `drawing_files` metadata table, 파일도
  scene과 동일하게 평문 저장(D-005 연장). Orphan 정리는 설계만 하고 실행은
  미룸.
- `supabase/migrations/20260820140250_create_drawing_files_storage.sql`:
  bucket 생성(`insert into storage.buckets`), `drawing_files` table + RLS(부모
  drawing 소유권까지 확인), `storage.objects`에 대한 4개 RLS policy
  (`storage.foldername(name)[1] = auth.uid()`), `drawing_files`에 대한 명시적
  GRANT (drawings table 때와 같은 이유 — "Automatically expose new tables"
  꺼져 있음). `storage.objects`/`storage.buckets` 자체는 Storage 확장이 이미
  기본 권한을 갖고 있어 별도 GRANT가 필요 없다.
- `excalidraw-app/cloud/fileAdapter.ts`: `createCloudFileManager(drawingId)`가
  `excalidraw-app/data/FileManager.ts`(기존 local-first가 쓰는 것과 같은
  base class)를 Supabase Storage + `drawing_files`에 연결한 인스턴스를
  만든다. 버전 기반 dedup을 그대로 물려받아 "신규/변경 파일만 업로드"를
  별도 로직 없이 만족한다. 그림마다 새 인스턴스를 만든다 — 경로에
  `drawingId`가 박혀 있어서 인스턴스를 공유하면 전환 중 업로드가 엉뚱한
  그림 폴더로 들어갈 위험이 있다.
- `excalidraw-app/cloud/autosave.ts`: scene 저장이 성공한 직후 (별도 상태로)
  `currentFileManager.saveFiles(...)` 호출. 실패해도 scene "저장됨" 상태를
  되돌리지 않는다(guardrail #9 — scene 저장과 파일 업로드는 별도 상태).
- `excalidraw-app/cloud/openDrawing.ts`: scene 복원 후 이미지 element가
  참조하는 fileId를 모아 다운로드하고 `excalidrawAPI.addFiles()`로 채운다.
  다운로드가 끝나기 전에 사용자가 다른 그림으로 넘어갔으면(`generation`/
  `drawingId` 재확인) 결과를 버린다 — scene 저장/열기와 같은 stale-response
  방어(guardrail #5).
- `excalidraw-app/App.tsx`: 기존 `beforeunload`의 "저장 중 파일 있으면 닫기
  경고" 체크에 Cloud file manager도 OR로 추가.
- **검증**: `yarn test:typecheck`, `yarn test:code`(eslint), `yarn test:app`
  (121 files, 1858 tests, 베이스라인과 동일), `check-guardrails.mjs` 전부
  통과. 로컬 dev 서버로 앱이 정상 기동하고 console error가 없음을 확인—
  Cloud 그림을 안 열면 새 코드가 전혀 개입하지 않는다.

**남은 것 (사용자가 직접)**:

1. Supabase SQL Editor에서
   `supabase/migrations/20260820140250_create_drawing_files_storage.sql`
   실행.
2. 로그인 → 그림 열기 → 이미지 붙여넣기/삽입 → 몇 초 뒤 저장되는지, 새로고침
   또는 다른 기기에서 열었을 때 이미지가 그대로 보이는지 확인.
3. Supabase Dashboard → Storage → `drawing-files` 버킷에
   `<내 uid>/<drawing id>/<file id>` 형태로 object가 생겼는지, Table Editor에
   `drawing_files` row가 같이 생겼는지 확인.

## Milestone 6: MVP 검증과 복구

- [x] 여러 기기 간 동기화 확인 (사용자 확인, 2026-08-21 — Mac과 휴대폰에서
  같은 그림이 정상 동기화됨. 원래 문구는 Windows/iPad였는데 실제로는
  Mac/휴대폰 조합으로 확인함)
- [x] 같은 그림의 동시 편집 충돌 테스트 (사용자 확인, 2026-08-21 — 탭 2개로
  재현, 충돌 UI와 버튼 3개 동작 확인)
- [x] 오프라인 편집 후 재연결 테스트 (사용자 확인, 2026-08-21)
- [x] 다른 계정의 그림 접근 차단 UI 테스트 (2026-09-29, 상세 및 한계는
  [VALIDATION.md](./VALIDATION.md) 참고)
- [x] 저장 후 새로고침 및 재로그인 후 데이터 보존 확인 (2026-09-29,
  기존 실사용 결과 포함; 탭 종료 중 저장 중단 시나리오는 미검증)
- [x] 전체 drawing Export Backup (현재 그림의 파일 다운로드/복원 및 새 Cloud 그림 저장 확인, 2026-10-04; 계정 일괄 백업은 별도 범위)
- [x] 최소 version history 구현 (D-012 — 코드 완료, 아래 기록. migration 적용
  + 실제 복원 테스트는 사용자가 직접)
- [x] 실제 Supabase 운영 DB의 적용된 RLS 정책 직접 조회 (2026-10-03,
  Safari SQL Editor에서 26개 metadata 항목 확인)
- [x] Version History의 실제 복원 UI 수동 확인 (2026-10-03, 빈 상태 복원과
  복원 직전 도형으로 재복원 확인)
- [x] 이미지가 포함된 drawing의 PNG/SVG Export 확인 (Safari 실제 다운로드/재열기, 2026-10-04)
- [x] drawing 링크 로드 실패/권한 거부 UX 및 Cloud autosave 분리
  (2026-10-03, automated tests 통과)
- [x] 로그인 상태의 없는 ID/삭제된 ID URL 경고 및 정상 URL 열기 수동 확인
- [x] 다른 계정 소유 ID의 URL 자동 열기 UI 거부 수동 확인 (2026-10-04, Safari 일반/개인정보 보호 창의 다른 로그인 계정)
- [x] 네트워크 오류의 URL 자동 열기 UI 수동 확인 (2026-10-09 Safari 테스트 탭의 GET 실패 주입; 정상 재열기 확인)
- [x] 복구 후 URL 새로고침의 빈 캔버스 원인 조사/수정/재검증 (2026-10-09 로컬 검증; 운영 배포 제외)
- [ ] 다른 계정의 직접 Storage 및 쓰기/삭제 RLS 요청 검사

완료 조건: 로그인부터 여러 기기 복원까지 MVP 사용자 흐름이 안정적이다.

### 2026-09-29 MVP 검증 마감 기록

수동 브라우저 테스트와 자동 검증 결과를 [VALIDATION.md](./VALIDATION.md)에 기록했다.
테스트 전용 drawing은 삭제했고, 원래 사용자 drawing은 유지했다.

- 두 계정 사이에서 테스트 drawing의 고유 도형이 보이지 않는 것을 확인했다. 다만
  이는 브라우저 UI 수준 테스트이며, 운영 DB의 적용된 정책을 직접 조회한 결과는 아니다.
- 접근 불가/없는 drawing URL을 열면 기존 브라우저의 로컬 캔버스가 남을 수 있다.
  이는 데이터 유출로 확인된 것이 아니라 잘못된 문서를 보여주는 UI 혼동 문제다.
- 가드레일, typecheck, code tests, app tests, build는 통과했다.
- `test:other`는 기존 문서 6개의 Prettier 검사에서 실패했다. 상세는 `VALIDATION.md`를
  참고한다.

**2026-09-29 당시 다음 개발 우선순위**: drawing 로드 실패/권한 거부를 명시적으로 표시하고, 실패한
요청에서 이전 로컬 scene이 요청한 drawing인 것처럼 남지 않게 처리한다. 구현 전 완료
조건과 비동기 전환 위험을 문서화하고, 다른 계정 권한 거부 및 drawing A에서 B로 전환 중
응답 순서가 바뀌는 회귀 테스트를 먼저 추가한다.

2026-10-03 업데이트: 해당 UX를 기능 브랜치에서 구현했다. 실제 Dashboard와
autosave coordinator를 함께 검사하는 회귀 테스트를 포함해 전체 1,868개 테스트가
통과했다. signed-in Safari에서 정상 URL, 없는 ID/삭제된 ID 경고, 버전 복원과
재복원, 테스트 drawing 삭제를 확인했다. 사용자 관리자 로그인 후 Safari에서 운영
RLS/권한/bucket/trigger 설정 조회도 완료했다. 이후 우선순위는 이미지 업로드 상태와
실패 처리, 이미지 export, 저장 중 탭 종료 복구, 전체 backup/export 검증이다.

### 2026-10-03 이미지 저장 상태 개선

완료 조건과 비동기 위험은 DECISIONS D-013에 먼저 기록했다. scene과 파일이 모두 성공한 뒤에만 `저장됨`으로 표시하고, 업로드 중/실패 상태 및 수정 없이 재시도를 구현한다. 파일 재시도는 scene revision을 불필요하게 증가시키지 않는다. 신규 그림/복사본도 기존 이미지 업로드를 시작한다.

- [x] 업로드 완료까지 single-flight 유지, partial error/Promise 거절 표시
- [x] generation 검사 및 업로드 중 후속 편집 큐 처리
- [x] 실패 시 초안 보존, 이미 동기화된 no-op 초안 정리
- [x] 저장된 이미지의 Safari 새로고침 복원 확인
- [x] 로컬 서버 실행/재시작, 관리형 DB 복구, Vercel 배포 절차 문서화 (`operations.md`)
- [x] 미업로드 binary의 문서별 로컬 복구와 일반 탭 닫기/재열기 검증 (2026-10-04 탭 한정 업로드 실패; OS 강제 종료/실제 회선 단절은 별도)
- [x] 이미지 포함 export 및 현재 그림 backup/복구 절차 검증 (2026-10-04; 계정 일괄 백업 제외)

현재 작업은 계속 Milestone 6이다. 운영 배포 완료와 구분하며 검증 명령/결과/남은 위험은 VALIDATION의 최신 기록을 따른다. 그 뒤 폴더/검색 등 Workspace 개선, 자체 협업 인프라, AI Gateway/Local LLM, MCP 단계로 진행한다.

### 2026-10-04 이미지 초안 복구

설계/완료 조건은 DECISIONS D-014를 따른다. scene과 참조 이미지 데이터를 같은 문서별 IndexedDB record에 저장한다. Cloud 파일 업로드 실패 후 새로 열었을 때 원격 scene과 같더라도 미업로드 bytes가 있으면 복구를 제안한다. 복구 선택은 이미지 추가와 restore API 적용 후 재업로드까지 연결한다.

- [x] BinaryFiles를 포함한 초안 저장과 기존 record 호환
- [x] snapshot token이 일치할 때만 초안 삭제 (다른 탭의 최신 초안 보존)
- [x] 초안 조회/파일 다운로드의 generation 검사와 문서별 로딩 잠금
- [x] IndexedDB 실패 표시, transaction 진행/업로드 중 종료 경고 연결
- [x] IndexedDB API(fake-indexeddb 환경) 및 복구 UI 통합 회귀 테스트
- [x] Safari 일반 탭 종료/재열기 및 탭 한정 업로드 장애 주입 검증 (2026-10-04)
- [ ] Safari 프로세스 강제 종료/저장소 eviction 검증 (초안 보존 보장 범위와 구분)
- [x] 이미지 포함 export와 전체 drawing backup/복원 검증 (2026-10-04 Safari 수동 확인)

자동 테스트 통과는 OS 강제 종료 직전의 미완료 transaction까지 보장한다는 뜻이 아니다. 300ms debounce 이전 종료나 사용자가 종료 경고를 무시한 경우는 별도 위험으로 남긴다. 상세 결과는 VALIDATION에 기록한다.

### 2026-10-04 이미지 export와 파일 백업 검증

DECISIONS D-015의 범위에서 기존 API를 그대로 사용한다. `exportRecovery.test.ts`에 Cloud database scene + 파일 결합, `.excalidraw` 독립 복원, 다른 그림 파일 제외, SVG 이미지 bytes 포함, PNG/SVG 편집 데이터 복원, 일반 이미지와 편집 백업 구분을 검사한다.

- [x] 이미지 포함 파일 백업/복원 자동 테스트 6개
- [x] 기존 Cloud/이미지 export 회귀 테스트 포함 집중 검증
- [x] 원본 Cloud를 덮어쓰지 않는 복원 절차 및 백업 한계 문서화
- [x] Safari 실제 PNG/SVG/Excalidraw 다운로드 및 별도 비로그인 세션에서 파일 열기
- [x] 복원본을 새 Cloud 그림으로 저장하고 새로고침 검증

위 파일 백업 수동 검증은 완료했다. Milestone 6의 강제 종료/장애 주입 및 다른 계정 URL 오류 수동 항목 등은 별도로 남아 있다. 계정 전체 일괄 백업/버전 보존은 이번 검사에 포함되지 않는다.

### 2026-10-04 저장 장애/탭 재열기 후속 검증

기존 검증 변경은 기능 브랜치의 `0387136c`에 커밋했다. 다음 검사는 기존 테스트 복원본만 사용하고 노트북 네트워크, Supabase 정책, 실제 사용자 그림을 변경하지 않는다.

- [x] Safari 테스트 탭에 한정한 오프라인 신호/이미지 업로드 실패 재현과 편집 초안 저장
- [x] 자동 검사: scene 요청 실패 → 메모리 초기화 후 persisted 초안 조회 → 복구 재실패 → 수동 재시도 성공 (online/offline 신호 각각)
- [x] 탭 닫기/재열기 후 미업로드 이미지 bytes의 초안 복구 안내 확인
- [x] 로컬 변경 사용 후 이미지 재업로드와 저장 완료 확인
- [x] 복구 뒤 새로고침만으로 이미지 표시 확인: 2026-10-04 실패 뒤 D-016 수정, 2026-10-09 반복 새로고침 정상

완료 조건: 동기화 실패 중 로컬 초안이 남고 재열기 후 명시적 복구가 가능하다. 위험: tab-level offline 신호/요청 실패 주입은 실제 통신 단절과 구분한다. 일반 탭 종료는 Safari 프로세스 강제 종료/OS crash/eviction 검증이 아니다. 테스트 탭 외의 네트워크나 저장소를 차단/삭제하지 않는다.

자동 검사는 26개 통과했다. 저장소는 테스트 환경의 fake-indexeddb를 사용하므로 실제 Safari 재시작 내구성 검사가 아니다. 사용자가 개발자용 기능을 켠 후 실제 Safari 탭에서 업로드 실패/초안 복구/재업로드를 확인했다. 새로고침 후 빈 캔버스 문제가 남아 전체 흐름 완료로 판정하지 않는다. 상세 결과는 VALIDATION의 Safari 업로드 장애 기록을 따른다.

### 2026-10-04 Safari 재개 검증

- [x] 저장 완료된 테스트 복원본의 탭 닫기/새 탭 재열기 및 이미지 표시 확인
- [x] 비로그인 개인정보 보호 창에서 Cloud URL 접근과 로그인 메뉴 확인
- [x] 로그인 테스트 탭의 없는 ID 오류 후 정상 그림으로 복귀 확인
- [x] 공개 publishable key만 사용한 비로그인 table GET 거부 확인 (읽기 전용, 응답 본문은 로그에 남기지 않음)
- [x] 개인정보 보호 창의 다른 로그인 계정에서 같은 drawing URL 접근 거부 확인
- [x] 사용자가 개발자용 기능을 켠 후 테스트 탭에 한정한 업로드 요청 실패/초안 복구 검사

완료 조건: 기존 테스트 그림만 사용하고 원본 삭제/덮어쓰기 없이 각 UI 결과를 확인한다. 정상 탭 재열기는 저장 장애/강제 종료 테스트가 아니며, 비로그인 접근은 다른 로그인 계정의 RLS 요청 검사를 대체하지 않는다. 테스트 탭의 요청 실패 주입은 종료/재열기로 제거한다. 개발자용 기능은 사용자가 직접 켰으며 그대로 유지한다. 운영 DB/노트북 네트워크는 변경하지 않는다.

URL 로더/Dashboard 자동 테스트 10개 통과. 비로그인 table GET 세 요청은 모두 HTTP 401 / `42501`로 거부됐다. 이어서 다른 로그인 계정의 원 계정 테스트 그림 URL 거부/목록 격리도 확인했다. 비로그인 및 계정 UI 검사는 Storage 객체 접근이나 직접 UPDATE/DELETE RLS 요청 검사를 대체하지 않는다. 탭 한정 업로드 실패 복구는 확인했지만 새로고침의 빈 캔버스 문제는 미해결이다.

### 다음 우선 작업: Safari 새로고침의 빈 캔버스

2026-10-09 착수: D-016의 완료 조건으로 실제 편집기 initialData 지연 회귀 검사를 먼저 추가한다. 편집기 준비 후 URL 열기와 Cloud 탭의 전역 로컬 동기화 경계를 수정하고 자동 검사/Safari 결과를 구분해 기록한다.

- [x] App 초기 scene 복원/URL 자동 열기 경합 재현 및 LocalData 동기화 경계 확인
- [x] 실제 편집기와 지연된 initialData/초기 인증 상태를 포함한 회귀 검사 2개
- [x] 편집기 준비 후 URL 열기 및 Cloud 탭의 전역 로컬 동기화 차단, Safari 반복 새로고침/새 탭 이미지 표시 재검증
- [ ] 서로 다른 로컬 scene을 가진 두 탭 및 늦은 로컬 파일 응답의 실기기 검사

완료 조건: 동일 URL을 새로고침해도 저장된 그림이 자동 표시되며 늦은 로컬 초기화/다른 탭 데이터가 Cloud 캔버스를 교체하거나 저장하지 않는다. 기존 local-first/공유 hash/협업 흐름은 보존한다. 초기화 경합은 실제 편집기 테스트로 재현 후 수정했다. 서로 다른 전역 local scene과 파일 응답 순서 역전의 실기기 검사는 별도이며 데이터 유실을 확정한 결과는 아니다.

### 2026-10-04 접근 검사 재실행 하네스

- [x] 프로젝트 ref와 공개 키 종류를 검사하는 비로그인 table GET 하네스
- [x] 권한 거부와 단순 통신 오류/빈 응답을 구분하는 자동 테스트
- [x] 현재 프로젝트 읽기 전용 실제 실행 및 운영 가이드 명령 추가

완료 조건: 추가 dependency 없이 Node로 세 개인 table의 GET만 요청한다. 예상 프로젝트가 다르거나 키가 공개용이 아니면 요청 전에 중단한다. 401/403 + `42501`만 기대한 권한 거부로 판정하며, 200 빈 목록/404/서버 오류/통신 실패는 통과로 오인하지 않는다. 로그에 응답 본문/키/scene을 포함하지 않는다. 비로그인 검사만 자동화하며 로그인 계정 간 RLS/Storage/쓰기 테스트는 별도다.

2026-10-03 후속 검증 결과:

- [x] URL 로드 실패 후 대기 중인 저장 및 추가 편집이 Cloud 저장 요청을 만들지 않는다.
  기존 로컬 초안은 보존한다. 이를 Dashboard와 실제 autosave coordinator를 함께
  실행하는 회귀 테스트로 검증한다.
- [x] Strict Mode에서 URL 조회가 중복되지 않고, 계정 변경 및 같은 drawing의 새로운
  open generation 뒤 도착한 응답이 현재 편집 상태를 바꾸지 않는다.
- [x] 버전 기록 버튼을 누르면 Dashboard가 닫히고 버전 기록 창이 바로 보인다.
  테스트 전용 drawing에서 실제 복원 결과와 복원 전 상태의 기록 보존을 확인한다.
- [x] 생성한 테스트 drawing은 삭제 후 목록에서 사라지는 것을 확인한다.

위험: URL의 ID만 비교하면 같은 drawing을 다시 열었을 때 오래된 응답을 적용할 수
있다. 기존 generation 검사와 작은 회귀 테스트를 추가한다. 모달 두 개가 동시에
열리면 접근성 focus와 화면 표시가 충돌하므로 버전 기록으로 전환할 때 Dashboard를 닫는다.

### 2026-08-21 최소 Version History 구현 기록

D-012 결정에 따라 구현했다 (구글 시트/문서 버전 기록을 단순화한 모델 —
설계 논의는 대화 기록 참고).

- `supabase/migrations/20260821125802_create_drawing_revisions.sql`:
  `drawing_revisions` table (읽기 전용 — `authenticated`에 SELECT만 GRANT,
  INSERT/UPDATE/DELETE 권한 없음), `drawings`의 `BEFORE UPDATE` trigger가
  `scene_data`가 실제로 바뀔 때마다 "덮어써지기 직전 상태"를 자동으로 남기고
  그림당 최근 50개만 남기고 정리한다. 트리거 함수는 `security definer` +
  `search_path` 고정(권장 hardening)으로 작성해 `authenticated`가 직접 못
  쓰는 테이블에 안전하게 쓴다.
- `excalidraw-app/cloud/revisions.ts`: `listRevisions`(목록, scene_data
  제외 — 가볍게), `restoreRevision`(과거 scene_data를 현재 drawing에
  일반적인 조건부 UPDATE로 다시 씀 — autosave/충돌 해결과 동일한 낙관적
  동시성 검사를 그대로 통과해야 하고, 복원 자체도 트리거가 다시 기록해서
  "복원을 되돌리기"도 가능).
- `excalidraw-app/components/cloud/VersionHistory.tsx`: Dashboard 각 행의
  히스토리 아이콘에서 여는 다이얼로그. 시점 목록 + "복원" 버튼(확인 dialog
  거침). 미리보기는 이번 범위에 넣지 않았다. 복원 대상 그림이 지금 에디터에
  열려 있으면 자동으로 다시 불러와 화면을 최신 상태로 맞춘다.
- **검증**: `yarn test:typecheck`, `yarn test:code`(eslint), `yarn test:app`
  (121 files, 1858 tests, 베이스라인과 동일), `check-guardrails.mjs` 전부
  통과. 로컬 dev 서버 정상 기동, console error 없음.

**남은 것 (사용자가 직접)**:

1. Supabase SQL Editor에서
   `supabase/migrations/20260821125802_create_drawing_revisions.sql` 실행.
2. 그림 편집 → 저장 몇 번 반복 → "내 그림"에서 히스토리 아이콘 클릭 →
   목록에 시점들이 쌓이는지 확인.
3. 아무 시점이나 "복원" 클릭 → 캔버스가 그 시점 내용으로 바뀌는지, 다시
   히스토리를 열면 방금 복원 전 상태도 새 항목으로 남아있는지 확인.

## Milestone 7: 자체 공동편집 서버

- [x] 기존 공동편집 회귀 테스트 2개 통과. 두 브라우저 동시 편집은 별도다.
- [x] `excalidraw-room` Fork/Clone/upstream 등록 (`03ff4358` 기준)
- [x] 로컬 Socket.IO 서버 구현/실행, 실제 client relay/격리/재접속 하네스 7개 통과
- [x] Render Free WebSocket host 배포 (2026-10-13, `personal-excalidraw-room.onrender.com`, Source `e2defb1`, health/합성 relay/재접속 확인)
- [x] 배포 앱의 WebSocket endpoint 변경 (`d86d9e27`, Production success/version/bundle 확인; 운영 화면 미검증)
- [ ] sleep 후 재연결 UX 확인

이 단계에서도 공식 Firebase persistence는 먼저 유지한다.

2026-10-09: 로컬 단계 완료. 구현/위험은 `collaboration.md`, 서버 재기동은 `operations.md` 참고. 공개 호스팅/운영 endpoint 전환/실제 브라우저 동시 편집은 아직 완료하지 않았다.

완료 조건: 실시간 transport가 자체 room server를 사용한다.

## Milestone 8: 공동편집 Persistence 독립

2026-10-14 자원 제한 첫 단위(D-030): 새 Supabase 파일 압축 해제를 4 MiB + 64 KiB에서 중단하고 Edge 파일/ticket에 isolate별 요청 수/동시 처리 상한을 추가했다. 상한 초과·실패 슬롯 반환·정상 codec 호환을 검사한다. 운영 미배포/기본 flag off 유지. 남은 공개 전제는 DB 전역 scene/Storage 용량·분산 요청 quota, relay 전체 연결/송신 상한, 인프라 body/SQL parameter 로그 정책과 hosted 검증이다. 비용 상한 완성으로 표시하지 않는다.

2026-10-14 입장 통합 단위: D-028의 flag-gated 선택 화면/controller/Portal/session/Supabase provider 연결을 구현했다. ACK와 snapshot 준비 전 원본 유지, 실패 rollback, 개인 drawing 분리, 초기 peer queue, reconnect reconcile, read-only 및 계정/route/stop cleanup을 검사했다. 기본 flag off/운영 미배포를 유지한다. 새 방 생성/초대 관리 UI와 공개 abuse·inflate 메모리·로그 제한/hosted 데이터·두 클라이언트 검증은 남아 있다.

2026-10-14 프론트 세션 단위: ticket request와 challenge/ACK/자동 갱신/만료·재연결 worker를 작성했다(D-027). 실제 relay와 동일 worker의 입장·갱신·read 상태를 확인했다. 기존 startCollaboration이 ACK 전에 canvas reset/Firebase fallback을 하는 경계를 유지하며 새 worker를 아직 UI/controller에 붙이지 않았다. 다음은 ACK 후 remote scene 준비·원본 보존·read-only viewMode/provider 수명주기 통합이다.

2026-10-14 relay 단위: 별도 서버의 sc_ room 입장/갱신·read/write 검사, 소켓별 challenge, 60초 만료 종료, 수신자 필터와 공개 키 미설정 fail-closed를 구현했다(D-026). 기존 hex room 프로토콜은 유지한다. 프론트 입장/provider 연결, read-only UI, hosted DB/Edge/relay 배포 및 실기기 검증은 다음이다. 이 단위는 운영 활성화가 아니다.

2026-10-14 입장권 기반: 고정 버전 ECDSA P-256 입장권 계약, verifier/issuer handler와 미배포 Edge entrypoint를 구현했다(D-025). 서명/위조/만료/room·Origin·challenge·scope 검사 및 요청 제한을 자동 확인했다. 다음은 별도 relay 저장소의 공개 키 검증/socket challenge/갱신/전송 권한 처리와 프론트 입장 연결이다. 아직 실시간 입장 보호가 적용된 운영 서비스는 아니다.

2026-10-14 통합 adapter 단위: scene CAS/private 파일 factory와 socket별 실제 복원 scene version cache를 구현했다. controller/Portal operation snapshot 및 공유 FileManager reset generation으로 이전 방 응답/암호문/정리 작업이 새 방에 적용되지 않게 했다. Firebase 기본 provider와 새 방 잠금은 유지한다. 다음은 relay ticket/실제 입장 연결 및 읽기 전용 UI·broadcast 제한이며 운영 전환 전 메모리/rate/로그 제한도 남아 있다.

2026-10-14 파일 단위: private bucket/프록시/client 파일 계약을 작성하고 원본 압축·암호화 bytes/metadata와 generation 방어를 확인했다. 실제 hosted Storage/새로고침·다른 기기 복구는 미확인이다. 전체 adapter/relay ticket/운영 적용 전 기존 Firebase 및 새 방 잠금은 유지한다.

2026-10-14 입장 선택 단위: 로그인/게스트 화면, 분리된 guest client의 proof RPC 확인, local 5분·일회용 OAuth 복귀 구현. 미검증/잘못된 새 route는 Firebase에 연결하지 않고 canvas를 보존한다. 검증 성공 뒤에도 실제 새 방 접속은 잠금 상태다. 다음은 Storage/전체 adapter와 relay ticket 발급·검증이며 이후 운영 DB/실서비스 연결 검사와 활성화다.

2026-10-13 서버 scene 단위: D-021의 owner 관리/초대 검증/원자적 CAS migration 및 Supabase scene store 구현. 일회용 로컬 PostgreSQL의 역할 기반 권한 28항목, rollback 보존, 실제 두 DB 연결 CAS 경쟁 확인. 운영 DB 적용/HTTP JWT·게스트 검증/Storage/relay ticket/입장 UI는 남아 있으며 provider는 아직 Firebase다.

2026-10-13 후속: 로그인/게스트 선택 지원으로 결정(D-020). client invite route/proof/hash와 암호화 scene CAS/single-flight worker 구현. 실제 gateway/DB/RLS/Storage/입장 UI/relay auth는 미연결이며 전체 단계는 진행 중이다.

- [x] `CollabPersistence` interface 설계 및 controller 연결 (2026-10-13)
- [x] 기존 Firebase adapter 작성, 집중 테스트 10개/typecheck/lint/build 통과
- [x] Supabase adapter factory 작성 (2026-10-14, runtime 선택/운영 연결은 미완료)
- [ ] client-side encryption 유지
- [ ] encrypted scene/file 저장
- [x] 암호화 파일 private bucket/gateway/client 기반 구현 및 로컬 검사 (운영 미적용)
- [x] room URL key와 로그인 권한의 관계 결정 (D-020, 로그인/게스트 모두 초대 권한 검증; 서버 적용은 미완료)
- [ ] room 복구 및 동시 저장 테스트

완료 조건: Socket transport와 persistence 모두 개인 인프라를 사용한다.

2026-10-13 첫 단위 완료: 기존 Firebase 함수를 그대로 연결하는 계약/adapter만 구현했다. 실제 persistence는 여전히 Firebase이며 Supabase adapter/권한/CAS는 후속이다. 설계/범위는 `collaboration-persistence.md` 참고. 이 단위만으로 Milestone 8 전체 완료로 표시하지 않는다.

Milestone 8 최신 진행 (2026-10-14, D-029): 기본 off 아래 소유자용 빈 방 생성/초대 관리 UI 완료. 기존 owner RPC/RLS를 재사용하고 새 migration은 없다. 키는 화면 메모리만 사용하며 소유자 RLS로 지정 초대 hash를 확인해 만료·폐기 링크에서도 키만 복구한다. 운영 활성화와 두 실제 클라이언트 검증은 미완료다. 다음 순서는 공개 rate/총 용량/inflate 메모리·로그 정책 → 운영 DB/Edge·서명 키/relay 적용 → hosted owner/다른 계정/guest/read/write/폐기·파일 복원 검증 → 앱 flag 활성화 여부 결정이다. 무료 설정을 유지하며 AI Gateway는 그 이후다.

## Milestone 9: AI Gateway

- [ ] 별도 설계 문서 `ai-gateway.md` 작성
- [ ] provider secret을 보관하는 server-side API 구성
- [ ] provider adapter와 schema validation 구현
- [ ] 의미 중심 Diagram DSL 정의
- [ ] Canvas operation allowlist 정의
- [ ] Preview/Apply와 version snapshot 구현

완료 조건: 검증된 구조화 명령으로만 캔버스를 변경한다.

## Milestone 10: Local LLM

- [ ] localhost 전용 bridge
- [ ] Origin/token 검증
- [ ] Ollama provider adapter
- [ ] Cloud/Local provider 선택
- [ ] 외부 기기 연결이 필요할 때만 인증된 tunnel 검토

완료 조건: 로컬 PC가 켜져 있을 때 선택적으로 로컬 모델을 사용할 수 있다.

## Milestone 11: MCP와 Codex

- [ ] 별도 설계 문서 `mcp.md` 작성
- [ ] Personal Access Token 발급/폐기와 hash 저장
- [ ] read-only MCP tool부터 구현
- [ ] version snapshot을 전제로 write tool 구현
- [ ] drawing/element 권한 검증
- [ ] Codex에서 read/write 통합 테스트

완료 조건: 허용된 drawing에 한해 외부 agent가 안전하게 읽고 수정한다.

## 매 작업 검증

변경 범위에 맞춰 아래 검증을 실행한다.

```bash
yarn test:typecheck
yarn test:code
yarn test:app --watch=false
yarn build
```

모든 작업에서 실행한 검증, 생략한 검증과 이유, 남은 위험을 결과에 기록한다.
