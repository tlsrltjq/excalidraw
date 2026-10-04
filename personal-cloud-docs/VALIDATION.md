# MVP 검증 기록

## 2026-10-04 커밋 및 scene 저장 장애 복구 보강

기존 이미지 저장/초안/백업 검증 변경을 `codex/cloud-file-save-status`의 `0387136c` (`feat(cloud): preserve image drafts and verify backup recovery`)에 커밋했다. push, 통합 브랜치 병합, 운영 배포는 하지 않았다.

다음 작업으로 `draftRecovery.test.tsx`에 두 경우를 추가했다. scene UPDATE 요청이 실패할 때 online 신호가 false이면 offline, true이면 error로 표시된다. 둘 다 이미지 포함 초안을 유지한다. 편집기와 저장 coordinator 메모리를 초기화하고 이전 원격 scene을 열면 초안 복구 안내가 나타난다. 로컬 변경 사용 후 저장이 다시 실패해도 초안이 남으며, 저장 다시 시도 성공 후 파일 업로드와 초안 정리가 완료된다. 각 테스트 시작 때 scene UPDATE mock의 성공 응답을 명시해 앞 테스트의 mock 복원에 의존하지 않도록 했다.

검사 결과: autosave 12개, draft recovery 9개, local draft store 5개, 총 26개 통과. typecheck, code lint, 가드레일(4개 변경 파일), diff check, 새 테스트/README/VALIDATION의 scoped Prettier 통과. 최초 lint는 새 테스트의 줄바꿈 1개로 실패해 해당 줄만 수정했다. 광범위 문서 Prettier는 기존 AGENTS/ARCHITECTURE/DECISIONS/ENGINEERING_GUARDRAILS/ROADMAP 포맷 부채로 실패했고 일괄 재포맷하지 않았다. product 코드, dependency, DB migration, upstream core 변경은 없다. 전체 app tests/build는 이번 테스트 전용 변경에서는 생략했다. 직전 제품 코드의 전체 1,898개 테스트/build 기록은 별도로 유지한다.

검사 한계: 네트워크와 편집기 API는 mock이고 저장소 구현은 mock하지 않지만 테스트 환경의 `fake-indexeddb`를 사용한다. 이는 실제 Safari IndexedDB 디스크 내구성, 브라우저 재시작, 실제 네트워크 차단, OS crash 검사가 아니다. 자동 검사에서 제품 결함은 발견하지 못했다.

Safari에서 테스트 복원본 URL과 로그인, 내 그림 목록 및 복원본 열기까지 확인했다. 웹 검사기 단축키는 검사기를 열지 못했고 개발자용 기능 메뉴가 보이지 않았다. 설정 변경 확인을 요청했으며 아직 응답이 없어 설정/네트워크를 변경하거나 장애를 주입하지 않았다. 탭 오프라인/닫기/재열기 수동 검사는 **미완료**다. 테스트 복원본은 유지했고 원본 삭제/덮어쓰기를 실행하지 않았다.

## 2026-10-04 이미지 export와 현재 그림 백업 검사

이번 변경은 `excalidraw-app/cloud/exportRecovery.test.ts`와 개인 문서에 한정한다. 이전 작업의 미커밋 이미지 저장/초안 복구 코드를 유지했고 production 코드, upstream core, dependency, DB migration은 추가 수정하지 않았다. 완료 조건과 범위는 DECISIONS D-015에 먼저 기록했다.

### 자동 검사 범위

- database serializer로 만든 scene에 별도 복원 이미지 bytes를 합쳐 `.excalidraw`로 직렬화하고, 빈 local state에서 `loadFromBlob`으로 element/files/배경을 동일하게 복원한다.
- 다른 그림의 참조 없는 파일은 export에서 제외한다.
- SVG에 참조 이미지 data URL이 실제 포함되며 외부 Storage URL에 의존하지 않는다.
- 편집 데이터 포함 SVG에서 element와 원본 이미지 bytes를 복원한다.
- 실제 PNG fixture에 편집 데이터를 넣고 같은 import API로 scene과 bytes를 복원한다. 이 테스트는 실제 canvas PNG 렌더링/다운로드의 시각 검증을 대체하지 않는다.
- 편집 데이터 없는 PNG/SVG를 scene 백업으로 오인하지 않도록 import 오류 유형을 확인한다.

검사 결과: 신규 테스트 6개 및 Cloud/Dashboard/기존 export 집중 테스트 총 48개 통과. `yarn test:typecheck`, `yarn test:code`, 가드레일(변경 파일 16개) 통과. 전체 `yarn test:app --watch=false`는 127 files, 1,898 passed, 47 skipped, 1 todo로 통과했다. scoped Prettier와 `git diff --check`도 통과했다. 기존 테스트의 act()/의도적 오류 로그 및 ESLint MetaProperty parser 안내는 남아 있다.

### 수동 검사와 남은 위험

첫 시도는 Safari 창 제어 문제로 중단했으나, 같은 날 사용자 요청으로 다시 연결해 아래 수동 검증을 완료했다. 로컬 앱 `http://127.0.0.1:3001/`과 기존 Supabase를 사용했으며 운영 웹 배포를 검사한 것은 아니다.

- 기존 이미지 테스트 drawing에서 `화면을 담기` 옵션을 켜고 PNG/SVG, 별도로 `.excalidraw`를 다운로드했다. 이름은 `TEST-export-recovery-2026-10-04`, 파일은 Downloads에 남긴다. `.excalidraw.png` 10,631 bytes, `.excalidraw.svg` 6,463 bytes, `.excalidraw` 3,025 bytes다.
- 다운로드된 PNG 픽셀에 실제 테스트 이미지가 표시되는 것을 확인했다. 파일 백업의 live image 1개가 embedded file 1개를 참조하며, SVG에도 이미지 data URL이 있는 것을 읽기 전용으로 검사했다. scene 원문/bytes를 로그나 fixture에 복사하지 않았다.
- 새 Safari 개인정보 보호 창에서 앱 루트를 열고 `Google로 로그인` 메뉴로 비로그인 상태를 확인했다. `.excalidraw`, 편집 데이터 포함 PNG, 편집 데이터 포함 SVG를 순서대로 열었다. 각 파일에서 이미지가 정상 표시되었으며 PNG/SVG 복원 뒤 선택 테두리와 이미지 Crop 제어도 확인했다. 동일 세션에서 순차 검사한 것으로, 매 파일마다 저장소를 초기화하는 검사는 아니다.
- 기존 로그인 일반 창의 **새 탭**에서 `?drawing` 없는 앱 루트로 이동해 파일을 가져온 뒤, `현재 캔버스를 새 그림으로 저장`으로 `TEST 2026-10-04 backup-restore`를 만들었다. 새 ID는 `df912b92-80e3-46d8-8fd4-dd2160180cdd`이며 원본과 다르다. 이미지 업로드까지 `저장됨` 상태를 확인했다.
- 새 drawing URL을 새로고침한 후 이미지가 정상 표시되며 불필요한 초안 복구/오류 안내가 없는 것을 확인했다. 이는 같은 브라우저 새로고침 검사이며 완전히 다른 기기의 캐시 없는 다운로드 검사는 아니다.

원본 Cloud 그림의 덮어쓰기, 계정 로그아웃, 관리자 SQL/RLS 변경, 커밋/push/배포는 실행하지 않았다. 테스트 복원본 정리 여부는 사용자 확인 후 기록한다. 강제 종료/저장소 eviction 및 권한 오류의 남은 수동 검사는 별도 항목이다.

운영 문서에 현재 그림 백업 및 원본을 덮어쓰지 않는 복원 절차를 추가했다. Cloud 그림이 연결된 탭에서 파일을 가져오면 onChange/autosave가 그 그림에 저장할 수 있으므로 별도 비로그인 개인정보 보호 창에서 복원한다. 이미지가 아직 로딩 중이거나 누락된 경우 전체 백업이 아니다. `.excalidraw`는 현재 그림의 참조 이미지까지 담지만 계정 전체 그림/Cloud ID/권한/버전 기록/undo 이력의 백업이 아니다.

생략: production 코드 변경이 없어 수동 검증 재개 턴에는 typecheck/lint/app tests/build를 재실행하지 않았다(같은 코드의 직전 1,898개 테스트 및 이미지 복구 build 통과 기록 참조). 기존 문서 포맷 부채가 있는 `test:other`는 생략하고 README/operations/VALIDATION만 scoped Prettier 검사한다. 그림 파일 백업 검사는 완료로, Milestone 6의 강제 종료/권한 오류 등 남은 항목은 미완료로 유지한다.

## 2026-09-29 검증 종료

범위는 구현 변경 없이 Personal Cloud MVP의 자동 검사, 주요 사용자 흐름, 두 계정 간 drawing 접근 격리 확인이었다. 검증용 drawing은 테스트 후 삭제했다.

### 자동 검증

| 검사 | 결과 | 기록 |
| --- | --- | --- |
| `node personal-cloud-harness/check-guardrails.mjs` | 통과 | 검사 대상 변경 파일 0개 |
| `yarn test:typecheck` | 통과 | TypeScript 검사 성공 |
| `yarn test:code` | 통과 | 코드 검사 성공 |
| `yarn test:app --watch=false` | 통과 | 121 files, 1,858 passed, 47 skipped, 1 todo |
| `yarn build` | 통과 | Production build 성공 |
| `yarn test:other` | 실패 | 기존 Markdown 6개가 Prettier 형식 검사에서 검출됨 |

`test:other`에서 검출된 파일은 `AGENTS.md`, `personal-cloud-docs/ARCHITECTURE.md`, `DECISIONS.md`, `ENGINEERING_GUARDRAILS.md`, `README.md`, `ROADMAP.md`다. 문서 의미의 오류가 아니라 포맷 차이이며, 이번 검증에서는 해당 문서들을 일괄 재포맷하지 않았다. 추가된 이 파일을 포함해 문서 전체 포맷 검사를 다시 실행할 필요가 있다.

빌드에는 Assistant 글꼴 파일 참조, 큰 chunk, 오래된 Browserslist 데이터에 대한 경고가 있었지만 빌드를 막지는 않았다.

### 브라우저 검증

- 기존 실사용 검증에서 저장 후 새로고침 복원, 재로그인 후 drawing 유지, 여러 기기 동기화, 오프라인 후 재연결, 동시 편집 충돌 흐름을 확인했다.
- 이전 테스트 세션에서 이미지 업로드 후 다른 환경에서 복원되는 것을 확인했다.
- 이번에는 두 계정으로 로그인해 테스트 drawing 목록이 두 번째 계정에 나타나지 않고, 원 계정에서 만든 고유 도형도 두 번째 계정의 화면에 나타나지 않는 것을 확인했다. 두 번째 계정 화면에는 그 브라우저의 기존 로컬 도형이 남아 있었다.
- 접근 불가 drawing URL에서 기존 로컬 캔버스가 남을 수 있다. 이는 요청한 drawing을 가져왔다는 뜻이 아니며, 이번 테스트에서 서버 scene 유출 증거는 발견하지 못했다. 사용자가 다른 그림을 잘못 보고 편집할 수 있는 UI 혼동은 실제 문제로 확인했다.
- Supabase migration의 소스에는 `auth.uid() = owner_id` 형태의 사용자 격리 정책이 있다. 하지만 이 검증에서는 운영 Supabase DB의 실제 적용 정책을 직접 조회하지 않았다. 따라서 DB 설정 자체의 독립적인 운영 검증은 남아 있다.
- 테스트 전용 drawing을 삭제한 뒤 목록에서 사라진 것을 확인했다. 기존 사용자 drawing 두 개는 유지됐다.

### 미검증 또는 후속 항목

- 운영 Supabase DB에서 drawings, drawing_files, Storage의 실제 적용 RLS 정책 확인
- Version History에서 과거 revision을 복원하는 실제 UI 흐름
- 이미지가 포함된 drawing의 PNG/SVG Export
- 저장 도중 탭 종료 시 복구 및 전체 drawing backup/export 흐름
- 로드 실패, 권한 거부, drawing 전환 시 이전 scene 오표시 방지

## 2026-10-03 URL 자동 열기 실패 처리

접근 불가/없는 drawing 링크가 이전 캔버스를 요청한 Cloud drawing처럼 보이게 하던 문제를 수정했다.

- 실패하면 현재 캔버스는 지우지 않고 Cloud autosave 연결과 기준선만 해제한다.
- 자동 열기 실패 상태를 Dashboard 경고로 표시한다. 권한 거부와 없는 ID를 구별할 수 없을 때도 같은 안내를 사용한다.
- 사용자/URL이 바뀌어 오래된 요청이 도착하면 응답을 적용하지 않는다. React Strict Mode effect 재실행에서는 같은 요청 Promise를 공유한다.
- `urlDrawingLoader.test.ts`에서 성공, 없음/권한 거부, 네트워크 실패, 느린 stale 응답 네 가지를 검사한다.

### 검증 결과

- `node personal-cloud-harness/check-guardrails.mjs`: 통과
- `yarn test:typecheck`: 통과
- `yarn test:code`: 통과
- `yarn test:app --watch=false`: 122 files, 1,862 passed, 47 skipped, 1 todo
- `yarn build`: 통과
- 관련 파일 ESLint와 `urlDrawingLoader.test.ts` 단독 실행: 통과 (4 tests)
- `yarn test:other`는 이번 코드 변경 검증에서 재실행하지 않았다. 앞선 검증에서 확인한 기존 문서 형식 실패는 별도 항목으로 남아 있다.

### 남은 수동 확인

로컬 앱 `http://127.0.0.1:3001/`에서 2026-10-03에 Google 로그인한 계정으로 다음을 확인했다:

- 유효한 테스트 drawing URL이 열리고, 편집 후 앱의 저장 상태가 `저장됨`으로 표시됐다.
- 없는 ID `?drawing=00000000-0000-0000-0000-000000000000`에서 접근 불가/없음 경고가 보였고 기존 캔버스가 유지됐다. 안내문에는 Cloud 자동 저장 연결 해제가 표시됐다.
- 실패 URL 뒤 유효 URL로 돌아오자 로컬 변경과 서버 버전 선택 UI가 나타났다. `서버 버전 사용`을 선택했다. UI에서 실패한 URL의 내용을 요청한 drawing으로 오인하지 않도록 막는 흐름은 확인했지만, 네트워크 요청 기록으로 autosave 부재까지 독립적으로 확인하지는 않았다.
- 당시 테스트 drawing 정리를 마치지 못했으나, 아래 후속 검증에서 삭제와 빈 목록을 확인했다.

다른 계정 소유 drawing의 URL, 로그인/로그아웃, `#room`/`#json` 등의 기존 hash 흐름은 이 브라우저 세션에서 재확인하지 않았다.

## 2026-10-03 후속 검증 및 버전 기록 창 수정

### 구현과 자동 검증

- URL 로더가 현재 drawing generation도 검사한다. 같은 drawing을 다시 연 뒤늦게 도착한 이전 응답은 적용하지 않는다.
- 버전 기록 버튼은 Dashboard를 닫고 history 창을 연다. 기존에는 Dashboard 뒤에 history 창이 가려져 Dashboard를 닫아야 보였다.
- `Dashboard.test.tsx`에 6개 통합 회귀 테스트를 추가했다. UI와 실제 autosave coordinator를 함께 실행하고 서버 저장 경계만 mock한다. 없음/권한 거부와 네트워크 실패 후 대기 중인 저장 및 추가 편집이 서버 저장을 만들지 않는지, scene과 로컬 초안이 지워지지 않는지, 정상 저장, Strict Mode 중복 조회 방지, 계정 전환/같은 drawing 재열기의 늦은 응답 무시, 모달 전환을 확인했다.
- 가드레일, typecheck, 코드 검사, build: 통과.
- 전체 앱 테스트: 123 files, 1,868 passed, 47 skipped, 1 todo.
- `test:other`: 재실행했으며 기존 Markdown 6개의 포맷 차이로 실패했다. 파일 목록은 첫 검증 기록과 동일하다. 코드 검사 과정에서 발견한 새 테스트 import 순서는 수정했다.

### Safari 수동 검증

- 정상 URL에서 테스트 drawing을 연 뒤 history의 이전 빈 scene으로 복원했다. 다시 열고 서버 버전을 선택했을 때 빈 scene이 표시됐다.
- 복원 전 scene이 새 history 항목으로 남는 것을 확인했다. 이를 선택해 재복원한 뒤 서버 버전을 선택하자 테스트 사각형이 화면에 돌아왔다.
- 수정한 history 버튼은 바로 버전 기록 창을 표시한다.
- 테스트 전용 drawing `58ecee8f-7fd0-4124-9e10-6ac6d4e2d09e`를 삭제했고, `내 그림`에 `아직 그림이 없습니다`가 표시되는 것을 확인했다.
- 삭제된 URL을 다시 열었을 때 접근 불가/없음 경고와 Cloud 자동 저장 연결 해제 안내가 표시됐다. 기존 브라우저 canvas는 보존됐다.
- 로컬 서버는 IPv4 주소의 OAuth 세션을 유지하기 위해 `127.0.0.1:3001`에 바인딩했다.

### 남은 항목과 다음 작업

- 운영 RLS 실제 적용 정책은 사용자 관리자 로그인 후 Safari에서 조회 완료했다. 아래 운영 조회 기록을 참고한다. 읽기 전용 조회는 `personal-cloud-harness/inspect-cloud-access.sql`, 판정 기준은 `operations.md`에 있다.
- 다른 계정 URL/Storage 요청 차단 및 네트워크 오류의 실제 UI 검증.
- 이미지 포함 PNG/SVG export, 저장 도중 탭 종료 복구, 전체 drawing backup/export.
- 현재 열린 drawing을 삭제한 직후 URL이 해당 ID로 남는 것은 관찰됐다. 새로고침 뒤 실패 처리는 정상이며, 삭제 직후 current drawing/autosave 연결 해제는 후속 개선 항목이다.
- 이미지 업로드 완료 전에 `저장됨` 상태를 표시하는 기존 로직은 가드레일과 다르다. 파일 업로드 실패 표시와 scene/file 저장 상태 분리를 다음 코드 개선 대상으로 뒀으며, 아래 후속 작업에서 수정했다.

## 2026-10-03 이미지 저장 상태와 운영 가이드

작업 브랜치: `codex/cloud-file-save-status` (이전 로컬 수정 커밋 `89796a2b` 위에서 시작). DB schema와 upstream core 변경은 없다. 이 기록은 로컬 검증이며 운영에 새 코드가 반영됐다는 뜻이 아니다.

변경 파일/범위:

- `cloud/autosave.ts`: scene 성공 revision 반영과 파일 업로드 완료 상태 분리, 파일 재시도, 초안 보존, generation 및 후속 변경 검사
- `cloud/autosave.test.ts`: 느린 업로드/partial failure/거절/동일 scene 이미지/동일 ID 재열기/후속 편집/conflict/offline/파일 누락/no-op 초안 회귀 테스트 10개
- `cloud/openDrawing.ts`, `components/cloud/CloudSaveStatus.tsx`, `.scss`: 신규 그림/복사본 업로드 시작, 명시적 덮어쓰기 후 업로드, 업로드 상태와 재시도 UI
- `personal-cloud-docs/README.md`, `ROADMAP.md`, `DECISIONS.md`, `operations.md`, `VALIDATION.md`: 문서 역할과 현재 위치, 완료 조건, 실행/재시작/복구/배포 절차

Safari 실제 확인:

- 로컬 개발 서버를 `--host 127.0.0.1 --port 3001 --strictPort`로 기동하고 기존 로그인 세션으로 확인했다.
- 빈 검증 그림을 만들고 저장소의 비민감 테스트 이미지를 삽입했다. `저장됨` 표시와 새로고침 후 이미지 렌더링을 확인했다. 이는 동일 Safari의 새로고침 검증이며 다른 기기/깨끗한 브라우저의 binary 다운로드를 새로 검증한 것은 아니다.
- 처음 새로고침에서 불필요한 로컬 초안 안내를 관찰해, 동일 scene의 no-op 저장 콜백이 만든 초안을 정리하는 회귀 테스트와 처리를 추가했다. 이후 새로고침에서는 해당 안내 없이 이미지가 보였다.
- 검증 그림은 `TEST 2026-10-03 image-save-status`로 표시해 보존했다 (ID `48226eae-9256-4100-9eeb-1801303755f2`). 삭제는 실행하지 않았으며 다른 사용자 데이터는 변경하지 않았다.

최종 자동 검증:

- `node personal-cloud-harness/check-guardrails.mjs`: 통과
- `yarn test:typecheck`: 통과
- `yarn test:code`: 통과 (기존 MetaProperty parser 안내 출력)
- `yarn test:app --watch=false`: 124 files, 1,878 passed, 47 skipped, 1 todo
- 저장/Dashboard 집중 검증: 16 tests 통과
- `yarn build`: 통과 (기존 폰트/chunk/Browserslist 경고)
- 변경 코드 및 README/operations/VALIDATION의 scoped Prettier 검사와 `git diff --check`: 통과
- 개발 서버와 production build를 동시에 실행할 때 Vite lint watcher의 `build/assets` ENOENT 종료를 실제 관찰했다. 빌드 완료 후 서버를 재시작하며 운영 가이드에는 동시 실행을 피하는 순서를 추가했다. 운영 DB 문제는 아니다.

생략/남은 위험:

- 실제 Storage 장애/느린 네트워크/offline 재현은 이번 Safari 세션에서 주입하지 않았다. 해당 상태와 순서 역전은 mock 경계 및 실제 FileManager를 사용하는 자동 테스트로 확인했다.
- 초안은 scene/app state만 저장한다. 미업로드 binary의 문서별 crash/offline 복구는 아직 보장하지 않으며 이미지 포함 export, 저장 도중 탭 종료, 전체 backup/복원 검증은 다음 작업이다.
- Supabase Restart/Resume, Vercel Redeploy, DB migration은 가이드만 작성했고 운영 서비스에서 실행하지 않았다. UI 메뉴/정책은 공식 문서를 참고하되 당시 프로젝트 상태를 다시 확인한다.
- 전체 문서 Prettier 정리는 별도다. 기존 `test:other` 실패 문서 전체를 이번 기능과 함께 일괄 재포맷하지 않는다.

## 2026-10-04 문서별 이미지 초안 복구

Milestone 6 / D-014. 이전 작업의 미커밋 변경을 유지하면서 `codex/cloud-file-save-status`에서 이어서 구현했다. 이 기록은 운영 배포 결과가 아니다.

변경 범위:

- `cloud/localDraftStore.ts`: 참조 BinaryFiles와 snapshot token을 scene/app state와 같은 IndexedDB record에 저장한다. 기존 record는 그대로 읽을 수 있다. 성공한 snapshot token에 대한 조건부 삭제는 readwrite transaction으로 처리한다.
- `cloud/autosave.ts`: debounce worker에서 초안 쓰기, 저장 실패 메시지, 쓰기 완료 대기, generation 검사, 종료 경고 판단을 처리한다. 조회/다운로드 잠금은 generation별로 관리해 오래된 문서의 응답이 현재 문서 잠금을 해제하거나 영원히 막지 않게 한다.
- `cloud/openDrawing.ts`: 로컬 초안과 원격 이미지를 조회한 뒤 같은 scene의 미업로드 bytes도 복구 대상으로 판정한다. 비교와 복원은 기존 restore API를 사용하며, 초기 로딩 중 편집은 완료 시 현재 editor snapshot을 큐에 전달한다.
- `components/cloud/CloudSaveStatus.tsx`: 이미지 포함 복구와 재업로드, 실패 안내, 초안 삭제 실패 처리. 로컬 변경 복원 직후 잠금이 해제되기 전에 schedule이 무시되던 기존 경로도 수정한다.
- `App.tsx`: 기존 beforeunload 경고에 Cloud 초안 transaction/로딩/저장 진행 여부를 추가한다.
- `localDraftStore.test.ts`, `draftRecovery.test.tsx`, `autosave.test.ts`, `Dashboard.test.tsx`: 실제 IndexedDB 및 복구 UI 테스트, 기존 회귀 테스트 확장. docs는 README/ROADMAP/DECISIONS/operations/VALIDATION을 갱신한다. upstream core, dependency, DB migration은 변경하지 않는다.

자동 검증:

- 실제 IndexedDB: 이미지 bytes/참조 파일만 저장/문서 분리/legacy record/다른 탭의 최신 token 보존 5개 테스트
- 복구 통합: 업로드 실패 후 editor files를 비워 재열기 → 같은 원격 JSON에서도 복구 안내 → 로컬 이미지 복원 → 재업로드 성공 → 초안 삭제; 정상 동기화 시 안내 없음; 구버전 초안; 늦은 파일 응답; IndexedDB 조회 실패; 늦은 초안 응답; editor 오류 시 잠금 해제 7개 테스트
- autosave: local transaction 대기와 unload 판단, quota 실패와 재시도 등을 포함해 12개 테스트
- Cloud/Dashboard 집중 검증: 34개 통과
- 전체 `yarn test:app --watch=false`: 126 files, 1,892 passed, 47 skipped, 1 todo
- `yarn test:typecheck`, `yarn test:code`, `yarn build`, guardrails: 통과. 기존 lint parser 및 빌드 폰트/chunk/Browserslist 경고는 유지한다.

Safari 회귀 확인:

- 개발 서버를 재기동하고 `http://127.0.0.1:3001/`에서 기존 Google 로그인 세션과 `내 그림` 목록을 확인했다.
- 기존 `TEST 2026-10-03 image-save-status`를 열어 이미지가 실제 캔버스에 렌더링되고 불필요한 초안 경고가 없는 것을 확인했다. 새 데이터 생성/삭제 및 운영 DB 설정 변경은 하지 않았다.
- 변경 코드/테스트 및 README/operations/VALIDATION의 scoped Prettier와 `git diff --check`도 통과했다. 마지막 작은 generation 방어 변경 후 해당 복구 테스트 7개, typecheck, scoped lint와 build를 재확인했다.

생략/남은 위험:

- 자동 테스트의 reload는 editor의 file cache를 비우고 실제 IndexedDB에서 다시 읽는 방식이다. Safari의 OS 강제 종료, 저장소 eviction, 실제 Storage 장애/용량 제한을 새로 주입한 결과는 아니다.
- IndexedDB transaction 완료 전 강제 종료, 300ms debounce 이전 crash, 사용자 사이트 데이터 삭제/다른 origin/다른 기기의 복구는 보장하지 않는다. 종료 경고는 브라우저 정책/사용자 선택에 따라 무시될 수 있다.
- local 저장 실패는 안내하지만 export 파일 생성까지 자동으로 강제하지 않는다. `operations.md`의 파일 내보내기 절차를 따른다.
- 이미지 포함 export/전체 drawing backup, 운영 배포, 다른 기기에서의 새 binary 복원 검증은 다음 작업으로 남긴다. 기존 문서 전체 `test:other` 재포맷 검증은 생략하고 변경 코드와 새 문서를 scoped 검사한다.

### 운영 DB 실제 조회 결과

2026-10-03 사용자 요청에 따라 Safari의 로그인된 Supabase 프로젝트 SQL Editor에서 읽기 전용 metadata 쿼리를 실행했다. 총 26개 항목을 확인했다. 운영 설정 변경은 없었다.

| 검사 | 실제 조회 결과 |
| --- | --- |
| 그림/파일/버전/Storage RLS | 네 table 모두 활성화 |
| 그림 소유권 | SELECT/DELETE의 USING, INSERT/UPDATE의 WITH CHECK에 `auth.uid() = owner_id` |
| 파일 metadata | INSERT/UPDATE에 소유권과 parent drawing 소유권 EXISTS 검사 |
| Storage 정책 | 네 CRUD 정책 모두 bucket과 사용자 경로 검사; 다른 추가 정책 없음 |
| 비로그인 권한 | 세 개인 table의 SELECT/INSERT/UPDATE/DELETE 모두 false |
| 로그인 권한 | drawings/drawing_files CRUD true; drawing_revisions SELECT만 true |
| drawing-files bucket | `public = false` |
| timestamp/snapshot trigger | 모두 활성화 (`enabled = O`) |
| snapshot 함수 | SECURITY DEFINER이며 `search_path=public, pg_temp` 고정 |

현재 조회한 적용 정책은 저장소 migration 및 운영 판정 기준과 일치한다. 관리자 조회는 다른 사용자 JWT의 실제 table/Storage 요청 테스트를 대체하지 않는다. 이전 두 계정 UI 검증 외에 파일 요청 단위의 거부 검증은 별도 후속 항목으로 남긴다.
