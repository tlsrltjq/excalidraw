# MVP 검증 기록

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
- 이미지 업로드 완료 전에 `저장됨` 상태를 표시하는 기존 로직은 가드레일과 다르다. 파일 업로드 실패 표시와 scene/file 저장 상태 분리를 다음 코드 개선 대상으로 둔다.

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
