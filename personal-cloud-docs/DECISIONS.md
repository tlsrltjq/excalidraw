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
- 결정: 가능한 기능은 `excalidraw-app` adapter와 component로 구현하고
  `packages/excalidraw` 변경은 공개 API가 부족한 경우로 제한한다.
- 영향: core 변경이 필요하면 먼저 이 문서에 변경 이유와 대안을 기록한다.

## D-004: 익명 local-first 사용

- 상태: 결정
- 결정: 로그인하지 않아도 현재 Excalidraw의 로컬 편집과 Export를 사용할 수 있게 유지한다.
- 영향: 로그인은 Cloud Workspace 사용 조건이며 앱 전체 접근 조건이 아니다.

## D-005: Cloud scene 암호화

- 상태: 미결정
- 선택지 A: scene JSON을 RLS로 보호되는 PostgreSQL에 저장한다.
- 선택지 B: scene을 클라이언트에서 암호화한 뒤 저장한다.
- 고려사항: A는 검색, AI, MCP가 쉽고 B는 서버가 평문을 볼 수 없지만 검색과 agent 연동이 복잡하다.
- 결정 시점: `drawings` schema migration 작성 전

## D-006: Cloud 문서 URL 표현

- 상태: 미결정
- 선택지 A: `?drawing=<uuid>` query parameter
- 선택지 B: `/drawings/<uuid>` route
- 고려사항: 기존 hash는 share/collaboration 링크에서 사용하므로 Cloud drawing ID에 재사용하지 않는다.
- 결정 시점: Cloud Workspace 구현 전

## D-007: 동시 수정 충돌 UX

- 상태: 초안
- 결정: revision 불일치 시 자동 덮어쓰지 않고 원격 다시 불러오기, 로컬 복사본 저장,
  명시적 덮어쓰기를 제공한다.
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
  - `/(.*)` 전역 `Access-Control-Allow-Origin: https://excalidraw.com` 헤더는 excalidraw.com이
    자기 자신의 배포 asset을 다른 excalidraw 서브도메인/embed에서 cross-origin으로 읽을 때
    쓰는 규칙이다. 개인 배포 도메인은 `https://excalidraw.com`이 아니므로 이 값은 어떤
    origin에도 실질적 접근 권한을 주지 않는다. 무해하지만 의미가 없는 leftover다.
  - ROADMAP이 경고하는 실수는 "이 값을 개인 배포 URL로 단순 치환"하는 것이다. 치환하면
    "개인 배포 자기 자신"이 자기 자신의 asset을 cross-origin으로 읽도록 허용하는 것과
    같아 의미가 없고, 실제로 cross-origin 접근이 필요한 시점(예: 다른 도메인에서 폰트나
    embed를 가져가야 하는 경우)이 아니면 만들 필요가 없는 규칙이다.
  - `/webex/*` redirect와 `vscode.excalidraw.com` host 기반 redirect는 특정 path/host에만
    반응하므로 개인 배포에서는 트리거되지 않는다. 무해하다.
  - `outputDirectory`, `installCommand`는 개인 배포에도 그대로 유효하다.
- 영향: 지금은 변경하지 않는다. 개인 도메인에서 실제로 cross-origin 접근이 필요한 asset이
  생기면(예: 외부 사이트에 embed 위젯 제공) 그때 해당 asset에만 좁게 CORS 헤더를 추가하고
  이 문서에 갱신한다. 전역 규칙을 유지/재사용하지 않는다.
