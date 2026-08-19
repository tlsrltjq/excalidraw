# Personal Excalidraw Cloud 로드맵

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

- [ ] `drawings` table과 RLS migration 작성
- [ ] 그림 생성, 목록, 이름 변경, 삭제 API 작성
- [ ] Dashboard 구현
- [ ] URL에 현재 `drawingId` 표현
- [ ] 새 그림의 유효한 초기 Excalidraw scene 생성
- [ ] Cloud scene 로딩 시 Excalidraw restore API 사용
- [ ] 다른 사용자의 drawing 접근 차단 테스트

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

- [ ] IndexedDB에 `drawingId`별 scene 초안 저장
- [ ] 문서 전환 중 autosave 일시 정지
- [ ] `serializeAsJSON(..., "database")` 재사용
- [ ] 직렬화 결과 hash 비교로 실제 변경만 저장
- [ ] 1.5~2.5초 debounce
- [ ] 한 문서당 단일 저장 요청만 실행하고 최신 변경을 후속 저장으로 합치기
- [ ] `revision` 조건부 UPDATE 구현
- [ ] 충돌 감지 시 원격 로드/복사본 저장/덮어쓰기 UI 제공
- [ ] 저장 실패 시 로컬 초안 보존
- [ ] blur, 문서 전환, 로그아웃에서 저장 flush
- [ ] 저장 중/저장됨/실패/오프라인 상태 표시
- [ ] 공동편집 중 Cloud autosave 비활성화

완료 조건: 네트워크 오류나 충돌이 발생해도 마지막 로컬 변경을 잃지 않는다.

## Milestone 5: 이미지와 파일

- [ ] private Storage bucket 생성
- [ ] 경로를 `<owner>/<drawing>/<file>`로 제한
- [ ] `drawing_files` table과 RLS 작성
- [ ] 파일의 drawing 소유권을 DB 정책에서 검증
- [ ] BinaryFileData를 업로드 가능한 binary로 변환
- [ ] 로딩 시 BinaryFileData와 data URL 복원
- [ ] 신규/변경 파일만 업로드
- [ ] 삭제된 파일 정리 정책 작성
- [ ] 이미지 포함 Export와 복원 테스트

완료 조건: 이미지가 포함된 그림도 다른 기기에서 동일하게 열린다.

## Milestone 6: MVP 검증과 복구

- [ ] Windows에서 생성 후 Mac/iPad에서 복원
- [ ] 같은 그림의 동시 편집 충돌 테스트
- [ ] 오프라인 편집 후 재연결 테스트
- [ ] 다른 계정 접근 차단 테스트
- [ ] 새로고침/탭 종료/로그아웃 중 데이터 보존 테스트
- [ ] 전체 drawing Export Backup
- [ ] 최소 version history 구현

완료 조건: 로그인부터 여러 기기 복원까지 MVP 사용자 흐름이 안정적이다.

## Milestone 7: 자체 공동편집 서버

- [ ] 기존 공동편집 회귀 테스트
- [ ] `excalidraw-room` Fork/Clone/upstream 등록
- [ ] 로컬 Socket.IO 서버 테스트
- [ ] Render 등 WebSocket host에 배포
- [ ] 배포 앱의 WebSocket endpoint 변경
- [ ] sleep 후 재연결 UX 확인

이 단계에서도 공식 Firebase persistence는 먼저 유지한다.

완료 조건: 실시간 transport가 자체 room server를 사용한다.

## Milestone 8: 공동편집 Persistence 독립

- [ ] `CollabPersistence` interface 설계
- [ ] 기존 Firebase adapter 작성
- [ ] Supabase adapter 작성
- [ ] client-side encryption 유지
- [ ] encrypted scene/file 저장
- [ ] room URL key와 로그인 권한의 관계 결정
- [ ] room 복구 및 동시 저장 테스트

완료 조건: Socket transport와 persistence 모두 개인 인프라를 사용한다.

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
