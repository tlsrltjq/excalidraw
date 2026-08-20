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

- 상태: 결정
- 결정: revision 불일치 시 자동 덮어쓰지 않는다. Supabase의
  `UPDATE ... WHERE id = ? AND revision = ?` 조건부 update가 영향받은 행 0개를
  반환하면 충돌로 간주하고, 저장을 즉시 재시도하지 않고 사용자에게 3가지
  선택지를 보여준다:
  1. **원격 새로고침** — 로컬 변경을 버리고 서버의 최신 scene을 다시 불러온다.
  2. **복사본으로 저장** — 로컬 scene을 `createDrawing()`으로 새 drawing에 저장하고
     (원본은 건드리지 않음), 그 새 drawing으로 전환한다.
  3. **덮어쓰기** — 서버의 최신 revision을 다시 조회한 뒤 그 revision을
     expected로 써서 로컬 scene으로 강제 update한다 (사용자가 명시적으로
     선택했을 때만).
- 근거: 자동 재시도나 자동 병합은 element 단위 merge 로직이 없는 지금
  단계에서는 조용히 데이터를 잃을 위험이 있다. 세 선택지 모두 기존 로컬
  변경이나 원격 변경 중 어느 쪽도 몰래 사라지지 않는다.
- 영향: 충돌 UI는 autosave가 실패를 감지한 즉시 뜨고, 해결 전까지 해당
  drawing의 추가 autosave 시도는 멈춘다 (계속 충돌 응답만 쌓이는 것을 방지).
- 결정일: 2026-08-19 (Milestone 4 구현 착수 시점)

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

## D-011: 이미지/파일 저장 경로와 접근 제어

- 상태: 결정
- 결정:
  - private Storage bucket(`drawing-files`) 하나를 쓰고, 경로는
    `<owner_id>/<drawing_id>/<file_id>`로 고정한다 (ROADMAP Milestone 5 권장안).
  - 파일 metadata(`file_id`, `drawing_id`, `owner_id`, `mime_type`,
    `storage_path`)는 별도 `drawing_files` table에 저장한다 — binary 자체가
    아니라 "이 drawing이 이 file을 참조한다"는 사실과 복원에 필요한 mimeType을
    관계형으로 추적하기 위해서다 (Storage의 object 자체에는 구조화 조회가 안 됨).
  - scene_data와 마찬가지로 D-005 연장선에서 파일도 클라이언트 암호화 없이
    RLS로 보호되는 private bucket에 평문으로 저장한다. 근거도 동일하다 —
    Milestone 9/11(AI Gateway/MCP)이 이미지를 읽어야 할 수 있다.
- 근거:
  - path에 `owner_id`를 포함하면 Storage RLS policy가
    `(storage.foldername(name))[1] = auth.uid()::text`만으로 접근 제어를
    검증할 수 있어 policy가 단순해진다.
  - `drawing_files` row 없이 Storage object만으로는 어떤 drawing이 그 파일을
    쓰는지, mimeType이 뭔지 관계형으로 알 수 없어 복원(`getFiles`)과 orphan
    정리가 어려워진다.
  - `drawing_files`의 RLS는 `owner_id = auth.uid()`뿐 아니라 참조하는
    `drawing_id`가 실제로 그 사용자 소유인지도 `EXISTS` 서브쿼리로 검증한다
    (ENGINEERING_GUARDRAILS.md #12: "child row의 owner_id만 믿지 않고 parent
    drawing 소유권을 확인") — 그렇지 않으면 자기 소유가 아닌 drawing_id에
    자기 소유의 file row를 끼워 넣는 게 가능해진다.
- 영향: `excalidraw-app/cloud/fileAdapter.ts`가 이 경로 규칙과 두 RLS 경계
  (table + storage.objects)를 모두 전제로 구현된다. orphan file 정리(삭제된
  drawing/element가 참조하던 파일 청소)는 이번 결정 범위에 넣지 않고 별도
  유예 기간을 둔 작업으로 미룬다 (ENGINEERING_GUARDRAILS.md #9).
- 결정일: 2026-08-19/20 (Milestone 5 migration 작성 시점)
