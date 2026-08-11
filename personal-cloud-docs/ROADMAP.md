# Personal Excalidraw Cloud 로드맵

## 목표

공개 Excalidraw를 기반으로 기존 local-first 기능을 유지하면서 다음 기능을
순차적으로 추가한다.

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

MVP 범위는 로그인, 그림 목록, 자동 저장, 이미지 복원, 여러 기기 동기화까지다.
공동편집, AI, MCP는 MVP 이후에 진행한다.

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
- [ ] 공식 저장소를 `upstream`으로 등록
- [ ] Yarn 1.22.22 준비
- [ ] 의존성 설치
- [ ] 원본 앱 실행 및 기능 확인
- [ ] 원본 앱 빌드 확인
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

- [ ] `upstream` remote 등록
- [ ] `origin`과 `upstream` 확인
- [ ] Yarn 1.22.22 준비
- [ ] `yarn install`
- [ ] `yarn start`
- [ ] 캔버스, 도형, 텍스트, 화살표 확인
- [ ] PNG/SVG/Excalidraw Export 확인
- [ ] 새로고침 후 로컬 복구 확인
- [ ] `yarn test:typecheck`
- [ ] `yarn build`
- [ ] `node personal-cloud-harness/check-guardrails.mjs`

완료 조건: 수정하지 않은 upstream 앱이 로컬에서 실행되고 빌드된다.

## Milestone 1: Branch와 Baseline 배포

- [ ] `personal-cloud` 브랜치 생성
- [ ] 개인 Fork에 브랜치 push
- [ ] Vercel 프로젝트 연결
- [ ] Production Branch를 `personal-cloud`로 설정
- [ ] PC와 iPad에서 배포 주소 확인
- [ ] 폰트, PWA, Export, Local Save 확인
- [ ] `vercel.json`의 upstream 전용 redirect/header 검토

CORS는 같은 origin 앱을 보호하는 설정이 아니다. 전역
`Access-Control-Allow-Origin`을 개인 배포 URL로 단순 치환하지 않고 실제로
cross-origin 접근이 필요한 asset에만 설정한다.

완료 조건: 노트북이 꺼져도 배포된 원본 Excalidraw에 접속할 수 있다.

## Milestone 2: Supabase 기반과 인증

- [ ] Supabase 프로젝트 생성
- [ ] SQL migration 디렉터리 추가
- [ ] `@supabase/supabase-js`를 `excalidraw-app` workspace에 추가
- [ ] Supabase client와 환경변수 타입 추가
- [ ] Google OAuth 로그인/로그아웃 구현
- [ ] session restore 구현
- [ ] 익명 사용자의 기존 local-first 편집 유지
- [ ] OAuth redirect URL을 개발/운영 주소로 제한

프론트엔드 허용 환경변수:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
```

완료 조건: 로그인과 로그아웃 후에도 익명/로그인 사용 흐름이 각각 정상이다.

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

`owner_id`는 가능하면 DB에서 `auth.uid()`를 기본값으로 설정해 클라이언트가
임의 사용자 ID를 전달하지 않게 한다.

완료 조건: 로그인한 사용자가 본인 그림만 생성하고 열고 삭제할 수 있다.

## Milestone 4: 문서별 로컬 초안과 Cloud Save

Cloud Save 구현 전 문서별 로컬 초안을 먼저 만든다. 현재 upstream 로컬 저장은
하나의 장면을 고정 key에 저장하므로 여러 Cloud 문서를 그대로 연결하면 안 된다.

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
