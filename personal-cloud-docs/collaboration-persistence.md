# 협업 저장소 독립

## Milestone 8 첫 구현 단위 (2026-10-13)

완료 조건: 협업 controller의 저장 상태/scene 저장·로드/파일 저장·로드를 `CollabPersistence` 계약으로 모으고 기존 Firebase 구현을 그대로 연결한다. 새 dependency, DB migration, 운영 backend 전환은 없다. 기존 room 링크, client-side encryption, Firestore transaction reconcile, 파일 압축/암호화, save cache 및 오류 전파를 유지한다.

위험: 협업 scene은 개인 Cloud database JSON과 다르다. 현재 Firebase scene은 삭제 요소를 포함한 syncable elements를 암호화한다. 이를 임의로 serializeAsJSON/database scene으로 바꾸지 않는다. FileManager가 기존 encoder로 암호화한 bytes를 adapter에 전달한다. ShareDialog 등의 비협업 Firebase 경로는 이번 변경에서 제외한다.

## 현재 경로

```text
Collab -> CollabPersistence -> Firebase adapter -> 기존 data/firebase
                                   scene: transaction/decrypt/reconcile/encrypt
                                   file: 기존 Storage/encoder
Portal -> 암호화된 실시간 메시지 -> 개인 relay
개인 Cloud autosave -> 협업 중 중지
```

첫 계약은 기존 Portal과 socket cache를 유지해 동작 변경을 피한다. 저장소 선택 경계이며 새 네트워크 큐나 중복 암호화 계층이 아니다. 공개 Collab API의 Firebase 이름은 기존 호출자 호환성을 위해 유지한다.

## 로그인/게스트 및 CAS 구현 단위 (2026-10-13)

사용자는 처음 참여할 때 로그인/게스트를 선택하도록 결정했다. 두 경우 모두 유효한 invite가 필요하다. 계정 선택값을 권한으로 믿지 않고 gateway의 검증 결과만 적용한다. OAuth에는 origin만 전달하고 roomKey가 들어 있는 복귀 경로는 브라우저 안에서만 짧게 보관/정리하는 후속 입장 UI가 필요하다.

새 room ID는 `sc_` + 20 hex, query는 `collabStorage=supabase&invite=<UUID>`, hash는 기존 `#room=id,key` 형식을 유지한다. Firebase 링크는 그대로다. 서버가 sc\_ 방의 단기 입장 ticket을 검증하기 전 새 room을 만들거나 이 route를 운영에 연결하지 않는다. 현재 relay의 거부를 느슨하게 만들지 않는다.

초대 proof는 기존 128-bit room key에서 Web Crypto HKDF(SHA-256, room ID salt, versioned invite UUID info)로 파생한 256-bit bearer credential이다. 길이가 256-bit여도 원본 entropy는 기존 key의 128-bit를 넘는다고 주장하지 않는다. 원본 key를 서버로 보내지 않는다. proof hash를 비교하고 만료/폐기/room/read-write scope를 검증하는 gateway와 별도 DB가 필요하다. 이 helper만으로 권한 검증이 완성된 것은 아니다. 이미 받은 plaintext/key/bytes는 초대 폐기로 회수할 수 없다.

이번 완료 조건: malformed/unknown/중복 route 거부, room/invite/key별 다른 proof 및 canonical key 검증, 실제 AES-GCM/restore/reconcile를 사용하는 scene CAS worker, room별 single-flight, 충돌 재조회(최대 3회), stale operation 차단, 오류 전파. 실제 Supabase 원자성/RLS/Storage 검증은 mock store 결과와 구분한다. 운영 연결/DB 변경은 없다.

참고: [Web Crypto HKDF](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveBits), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security). 새 dependency는 추가하지 않는다.

구현 위치: `collab/persistence/invites.ts`의 route/proof/hash 처리, `sceneWriter.ts`의 암호화 저장 worker. 둘 다 아직 기본 Firebase adapter/입장 화면에서 호출하지 않는 단계다. Store 계약의 첫 CAS 생성 revision은 1이고, 이후 성공은 expected + 1이다. writer는 adapter마다 한 번 생성해야 room별 queue가 유지된다. 가드 함수는 각 await 뒤 현재 room/generation을 확인한다. 이미 서버에 전달된 write 자체를 취소하거나 이미 받은 데이터를 회수하는 보장은 없다.

## Supabase 후속 구현

### 서버 scene 구현 단위 (D-021)

구현: `supabase/migrations/20261013150000_create_collab_scene_rpc.sql`의 room/invite/scene + 관리/check/read/CAS 함수. proof SHA-256은 PostgreSQL 기본 sha256(bytea)를 사용해 추가 extension이 필요 없다. owner에게 room/초대 SELECT와 room disabled UPDATE만 주며 직접 scene 접근/테이블 생성·쓰기/권한 helper 호출은 닫았다. 비로그인과 로그인 역할에 check/read/CAS RPC만 공개하고 항상 proof를 검증한다. 로그인/게스트 선택은 UI 후속이며 계정별 초대 대상 지정 기능은 아니다.

`supabaseSceneStore.ts`는 SupabaseClient와 검증할 invite를 받아 scene writer의 Store 계약을 구현한다. key는 전송하지 않고 proof는 RPC body에만 전달한다. PostgreSQL base64 줄바꿈을 처리하고 bytes/IV/revision/sceneVersion/성공 revision을 확인한다. RPC 실패에 포함될 수 있는 세부 body는 UI 오류에 노출하지 않는다. 실제 기본 adapter/controller에서는 아직 호출하지 않는다.

검증: 일회용 로컬 PostgreSQL 16에 migration을 적용해 역할 기반 권한 28항목/rollback/두 연결의 첫 CAS 경쟁을 통과했다. 실제 Supabase Auth/PostgREST HTTP/운영 DB 검사가 아니다. client mock test와 기존 협업 집중 회귀는 합계 50개 통과했다.

완료 조건: room/초대 owner 관리와 로그인·게스트 공통 초대 검증 RPC, 원자적 scene CAS, 명시적 GRANT/RLS, 브라우저 ciphertext 변환 및 오류 검증. 운영 DB는 자동 적용하지 않는다. Storage/relay ticket/입장 선택 UI는 아직 연결하지 않는다. SQL 로컬 실행 여부와 mocked RPC 검사를 구분해 기록한다.

위험: SECURITY DEFINER는 RLS를 우회하므로 함수 내부에서 모든 권한을 검사한다. 직접 테이블 쓰기 및 scene 읽기를 닫고 초대 검증만 제한적으로 노출한다. 폐기는 진행 중 DB transaction과 직렬화하며 이미 받은 자료를 회수하지 않는다. scene 요청 2 MiB 제한은 전체 저장 용량/요청 rate limit의 대체가 아니다. 참고: [Supabase 함수 권한](https://supabase.com/docs/guides/database/functions).

- 기존 Firebase 링크를 자동으로 Supabase에 보내지 않는다. 새 room의 persistence 구분 정보를 hash 외부에 두는 명시적인 route가 필요하다. legacy 기본값은 Firebase다.
- scene/file은 별도 저장한다. DB에는 ciphertext/IV와 원자적 revision, Storage에는 기존 encoder의 암호화된 bytes를 보관한다. Render ephemeral filesystem에 영구 데이터를 저장하지 않는다.
- 서버는 roomKey를 받지 않는다. 클라이언트가 remote ciphertext를 복호화/restore/reconcile하고 expected revision으로 CAS 저장한다. 충돌 시 제한된 재시도, stale room/generation 및 room별 single-flight를 검사한다.
- owner RLS만 재사용하면 익명 링크 참여자의 권한을 표현할 수 없다. 로그인 owner가 room/초대를 관리하고 로그인/게스트 모두 invite proof를 제출하는 gateway가 필요하다(D-020). anon table CRUD나 공개 bucket은 열지 않는다. expiry/revoke/읽기·쓰기 scope와 relay 입장 ticket은 서버에서 검증해야 하며 아직 미구현이다.
- 권한 오류/지원되지 않는 provider는 다른 backend에 자동 저장하지 않는다. Firebase fallback은 기존 링크에만 적용한다.
- 후속 검증: 잘못된 key, 다른 room/계정 접근, 만료/폐기 권한, CAS 충돌, 느린 응답, offline, 이미지 업로드 실패/재열기, 모두 퇴장 복원, collaboration undo/reconnect.

## 완료 상태

### 입장 선택 화면 (2026-10-14, D-022)

`components/cloud/CollabEntry.tsx`에서 사용자 선택 후 `admission.ts`의 collab_check_invite RPC를 호출한다. 게스트는 persistSession/autoRefresh/detectSessionInUrl이 모두 꺼진 별도 client이며 기존 계정 JWT를 공유하지 않는다. 로그인 계정도 proof가 필요하다. scope/오류만 표시하고 RPC 본문/키는 출력하지 않는다. Strict Mode mount에서는 요청하지 않고 버튼 single-flight, route/account 변경과 unmount에 generation 검사를 사용한다.

Google OAuth는 origin으로만 돌아온다. `entryRoute.ts`가 검증된 같은-origin/path 초대 URL을 same-tab sessionStorage에 5분 보관하고 로그인 후 빈 root route일 때 한 번 소비한다. 다른 drawing/json/library route를 대체하지 않는다. 게스트 요청에는 OAuth를 수행하지 않고 로그인 오류/닫기에 pending return을 제거한다. 브라우저 저장소를 사용하지 못하면 오류를 표시한다.

App 초기화/새 route hash·popstate/Collab 직접 시작/Dashboard 자동 drawing 열기에 우회 방어를 추가했다. 초기 local scene은 정상 복원하며 실행 중 canvas와 닫기 동작은 현재 내용을 유지한다. 대소문자가 잘못된 sc_ marker와 unknown provider도 기존 링크로 fallback하지 않는다. 정상 기존 링크는 변경하지 않는다.

현재 초대 검증 성공 시 편집/읽기 전용 권한 확인만 표시하고 '공동편집 연결을 아직 사용할 수 없습니다'로 안내한다. 실제 입장 callback/socket 연결은 Storage/adapter/relay auth 준비 전 넣지 않는다. 운영 migration 적용/입장 ticket/실제 Google OAuth 검사는 미완료다.

- [x] CollabPersistence interface와 Firebase adapter
- [x] controller 연결과 집중 회귀 검사 (adapter 8개/협업 2개, typecheck/lint/build/guardrails)
- [x] 사용자 결정: 로그인/게스트 선택 지원, client invite route/proof/hash 기반
- [x] 암호화 scene CAS worker/single-flight/stale 결과/충돌·offline 테스트
- [x] 로그인/게스트 선택 화면, 초대 권한 RPC 확인, 같은 탭 OAuth 복귀 (실서비스 OAuth 미검증)
- [ ] relay ticket 포함 실제 공동편집 입장 처리
- [ ] Supabase 권한/route/CAS 최종 설계
- [x] scene 초대 검증/owner 관리/CAS migration 및 RPC store 작성, 로컬 PostgreSQL 권한·경쟁 검증 (운영 미적용)
- [ ] DB/Storage migration과 Supabase adapter
- [ ] encrypted scene/file 실기기 복구 및 운영 전환

기본 adapter, client invite/CAS worker, scene 권한 SQL/RPC store까지 구현했다. 운영 DB 적용, 전체 Supabase persistence adapter/Storage/relay ticket/사용자 입장 선택 화면은 미완성이며 운영 전환도 하지 않았다.
