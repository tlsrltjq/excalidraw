# 설계 결정 기록

결정이 확정되면 상태를 `결정`으로 바꾸고 근거와 영향을 기록한다.

## D-001: upstream과 개인 기능 분리

- 상태: 결정
- 결정: `master`는 upstream 추적용으로 유지하고 개인 기능은 `personal-cloud`에 통합한다.
- 근거: upstream 병합 충돌을 줄이고 배포 기준 브랜치를 명확하게 유지한다.

## D-002: 개인 문서 위치

- 상태: 결정
- 결정: 개인 Cloud 관련 문서는 `personal-cloud-docs/`에서 관리한다.
- 근거: upstream의 `dev-docs`와 소유권을 분리한다.

## D-003: Excalidraw core 수정 범위

- 상태: 결정
- 결정: 가능한 기능은 `excalidraw-app` adapter와 component로 구현하고 `packages/excalidraw` 변경은 공개 API가 부족한 경우로 제한한다.
- 영향: core 변경이 필요하면 먼저 이 문서에 변경 이유와 대안을 기록한다.

## D-004: 익명 local-first 사용

- 상태: 결정
- 결정: 로그인하지 않아도 현재 Excalidraw의 로컬 편집과 Export를 사용할 수 있게 유지한다.
- 영향: 로그인은 Cloud Workspace 사용 조건이며 앱 전체 접근 조건이 아니다.

## D-005: Cloud scene 암호화

- 상태: 결정
- 결정: 선택지 A — scene JSON(`serializeAsJSON(..., "database")` 결과)을 RLS로
  보호되는 PostgreSQL `jsonb` 컬럼에 평문으로 저장한다.
- 근거:
  - Milestone 9(AI Gateway)와 Milestone 11(MCP)이 scene 내용을 읽고 구조화된
    operation으로 조작해야 하는데, 클라이언트 암호화(B)를 쓰면 서버/에이전트가
    평문에 접근할 방법이 없어 그 마일스톤들이 사실상 막힌다.
  - RLS가 이미 `owner_id = auth.uid()`로 row 단위 접근을 막기 때문에, 지금
    위협 모델에서 실질적으로 얻는 보호는 "Supabase 자체가 침해당했을 때"
    정도이고, 그 대가로 검색/AI 연동을 전부 포기하는 건 이 프로젝트의 로드맵
    방향과 맞지 않는다.
  - 협업(Live Collaboration) 쪽은 별도로 이미 client-side encryption을 쓰고
    있고(Milestone 8, D-008/D-009 근처) 계속 유지한다 — 이 결정은 Cloud
    Workspace의 `drawings.scene_data`에만 적용된다.
- 영향: `drawings.scene_data`는 평문 JSON이므로 RLS policy가 유일한 접근
  제어 수단이다 — policy 작성/테스트를 특히 꼼꼼히 한다. 나중에 위협 모델이
  바뀌면(예: 여러 사용자에게 공유하는 기능) 이 결정을 재검토한다.
- 결정일: 2026-08-19 (`drawings` schema migration 작성 시점)

## D-006: Cloud 문서 URL 표현

- 상태: 결정
- 결정: `?drawing=<uuid>` query parameter를 사용한다.
- 근거:
  - `excalidraw-app`은 현재 client-side router가 없다 (`App.tsx` 단일 컴포넌트 트리,
    `react-router` 등 미사용). `/drawings/<uuid>` 같은 path route를 쓰려면 router
    dependency 추가와 `vercel.json`에 SPA fallback rewrite(`/drawings/*` ->
    `index.html`)가 새로 필요해 변경 범위와 upstream 충돌 위험이 커진다.
  - query parameter는 `/index.html?drawing=<uuid>`로 그대로 기존 static 배포에서
    동작해 서버 설정 변경이 전혀 필요 없다 (D-003의 "새 dependency는 기존 코드나
    Web API로 해결할 수 없는 경우에만 추가" 원칙과 일치).
  - 기존에 예약된 URL 흐름은 `?id`(legacy JSON backend), `#json=`, `#room=`,
    `#url=`이다(`AGENTS.md` URL/호환성 규칙, `App.tsx`의 `initializeScene` 확인).
    `drawing`은 이름이 겹치지 않는다.
- 영향: `excalidraw-app/cloud/urlDrawingId.ts`가 `history.pushState`/
  `replaceState`로 `?drawing=`만 다루고 hash는 건드리지 않는다. 나중에 path
  기반 route가 필요해지면(예: SEO, 공유 링크 미리보기) 이 결정을 재검토하고
  여기에 기록한다.
- 결정일: 2026-08-19 (Milestone 3 구현 착수 시점)

## D-007: 동시 수정 충돌 UX

- 상태: 초안
- 결정: revision 불일치 시 자동 덮어쓰지 않고 원격 다시 불러오기, 로컬 복사본 저장, 명시적 덮어쓰기를 제공한다.
- 결정 시점: autosave 구현 전

## D-008: 공동편집 중 Cloud Save

- 상태: 결정
- 결정: MVP에서는 live collaboration 중 일반 Cloud autosave를 비활성화한다.
- 근거: room scene의 소유권과 Cloud drawing revision 확정 정책이 아직 별도이기 때문이다.

## D-009: 자체 공동편집 배포 대상

- 상태: 초안
- 결정: 초기에는 standalone Socket.IO 서버를 실행하기 쉬운 WebSocket host를 사용한다.
- 고려사항: 무료 host는 sleep과 재시작이 있으므로 재연결 UX가 필요하다.

## D-010: Baseline `vercel.json`의 upstream 전용 규칙 처리

- 상태: 결정
- 결정: Milestone 1 baseline 배포 시점에는 `vercel.json`을 수정하지 않고 upstream 그대로 유지한다.
- 근거:
  - `/(.*)` 전역 `Access-Control-Allow-Origin: https://excalidraw.com` 헤더는 excalidraw.com이자기 자신의 배포 asset을 다른 excalidraw 서브도메인/embed에서 cross-origin으로 읽을 때쓰는 규칙이다. 개인 배포 도메인은 `https://excalidraw.com`이 아니므로 이 값은 어떤 origin에도 실질적 접근 권한을 주지 않는다. 무해하지만 의미가 없는 leftover다.
  - ROADMAP이 경고하는 실수는 "이 값을 개인 배포 URL로 단순 치환"하는 것이다. 치환하면 "개인 배포 자기 자신"이 자기 자신의 asset을 cross-origin으로 읽도록 허용하는 것과같아 의미가 없고, 실제로 cross-origin 접근이 필요한 시점(예: 다른 도메인에서 폰트나 embed를 가져가야 하는 경우)이 아니면 만들 필요가 없는 규칙이다.
  - `/webex/*` redirect와 `vscode.excalidraw.com` host 기반 redirect는 특정 path/host에만반응하므로 개인 배포에서는 트리거되지 않는다. 무해하다.
  - `outputDirectory`, `installCommand`는 개인 배포에도 그대로 유효하다.
- 영향: 지금은 변경하지 않는다. 개인 도메인에서 실제로 cross-origin 접근이 필요한 asset이생기면(예: 외부 사이트에 embed 위젯 제공) 그때 해당 asset에만 좁게 CORS 헤더를 추가하고이 문서에 갱신한다. 전역 규칙을 유지/재사용하지 않는다.
