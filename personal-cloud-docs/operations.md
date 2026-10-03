# 운영 검증 절차

## 실제 접근 정책 확인

저장소의 migration과 운영 DB의 현재 설정은 별도로 확인한다. `personal-cloud-harness/inspect-cloud-access.sql`을 운영 Supabase SQL Editor에서 실행한다. 이 쿼리는 설정 metadata만 조회하며 scene, 파일 내용, 계정 정보, 비밀값을 읽거나 변경하지 않는다.

판정 기준:

- `table_rls`: `public.drawings`, `public.drawing_files`, `public.drawing_revisions`, `storage.objects` 네 항목이 존재하고 `rls_enabled`가 모두 `true`다.
- `policy`: `drawings`의 읽기/생성/수정/삭제는 `auth.uid() = owner_id`로 제한된다. INSERT/UPDATE의 `with_check`도 소유자 변경을 막는다.
- `drawing_files`의 INSERT/UPDATE는 소유자 검사와 parent drawing 소유권 검사를 함께 한다. `drawing_revisions`에는 사용자 소유 SELECT 정책만 있다.
- Storage의 해당 정책은 `bucket_id = 'drawing-files'` 및 경로 첫 segment의 사용자 소유권을 검사한다. 다른 permissive 정책이 이를 우회하도록 허용하는지 전체 `storage.objects` 정책을 함께 검토한다.
- `table_privileges`: `authenticated`는 drawings/drawing_files CRUD가 가능하고 drawing_revisions에는 SELECT만 가능하다. `anon`에는 개인 table 접근을 허용하지 않는다.
- `bucket`: `drawing-files`가 존재하고 `public`은 `false`다.
- `trigger`: drawings의 timestamp 및 snapshot trigger가 활성화돼 있다. snapshot 함수의 `security_definer`가 `true`이고 `search_path`가 고정돼 있다.

쿼리 결과가 기준과 다르면 해당 항목을 검증 기록에 남긴다. 정책 수만 보고 통과시키지 않는다. SQL Editor는 관리자 권한이므로 실제 다른 계정의 요청 차단을 대신하지 않는다. 두 계정의 table/Storage 접근 테스트는 별도로 수행한다.

## 테스트 데이터 정리

테스트 drawing은 생성 당시의 ID로 추적한다. 삭제 후 `내 그림`에서 사라지고, 해당 URL을 새로 열었을 때 찾을 수 없음/접근 불가 안내가 나오는지 확인한다. Storage binary의 orphan 정리는 이 절차에 포함하지 않는다. 해당 보존 정책은 DECISIONS.md D-011을 따른다.
