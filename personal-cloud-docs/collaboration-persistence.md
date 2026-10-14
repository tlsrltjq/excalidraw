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

### 파일 프록시 구현 계획 (D-023, 2026-10-14)

구현: `supabase/functions/collab-files/{handler,index}.ts`는 Web Request 기반 schema/Origin/크기 검사 및 authorize→Storage 순서다. index는 서버 env에서만 관리자 credential을 읽고 기존 REST API를 fetch로 호출해 새 SDK dependency가 없다. 누락 설정은 503, 잘못된 Origin/초대/read scope upload는 거부하며 body/diagnostics를 반환하거나 로그로 출력하지 않는다. config.toml의 verify_jwt=false는 이 미배포 함수에만 한정한다.

`supabaseFiles.ts`는 기존 파일 prefix 계약과 upstream encode/decompress를 유지한다. 전송 동시 실행은 한 호출당 최대 3개, 로드는 ID를 dedupe한다. 파일 ID/key/prefix/bytes/metadata와 성공 응답을 확인하고 부분 실패 목록을 유지한다. 필수 isCurrent callback을 매 await 이후/최종 반환 전에 검사해 room/operation generation이 바뀌면 AbortError로 중단한다. callback은 전체 adapter 연결 단계에서 room/account/generation에 묶어야 하고 결과 적용 직전 controller도 재확인한다. 이미 전송된 서버 쓰기를 취소하지는 못한다.

보안 가드레일은 supabase/functions 내부의 정확한 Deno.env.get 서버 credential lookup만 허용한다. browser/VITE 및 서버 credential literal 금지는 유지하고 임시 Git fixture 검사 4개로 확인했다. 실제 secret은 읽거나 저장하지 않았다.

검증: 실제 upstream AES/압축 codec와 Web Request handler를 통과해 synthetic data URL 복원, 새 client 재생성 복원, 부분 실패/재시도, 다른 room/key 및 늦은 결과를 확인했다. 이는 PNG 렌더링/실제 reload/다른 기기/hosted Storage 검사가 아니다. 일회용 PostgreSQL의 최소 storage schema에서 restrictive RLS 11항목과 기존 scene 28항목을 확인했고 Deno 2.9.7 check를 통과했다. Edge runtime의 실제 REST 업로드/다운로드는 미검증이다.

남은 위험: 원본 codec은 inflate 단계의 최대 메모리 사용량을 제한하는 API가 없다. 이 단위의 압축 전후 bytes 제한은 inflate 중 메모리 상한을 보장하지 않는다. 공개 활성화 전 bounded decode 방안, rate/총 용량/header·body 로그와 실제 hosted HTTP 검사를 다뤄야 한다. 오류가 남으면 저장 성공으로 표시하거나 기존 Firebase에 fallback하지 않는다.

이번 완료 조건은 private collab-files bucket/RLS, 초대 검증 후 암호문 bytes만 중계하는 Edge upload/download, FileManager 파일 계약과 client decoder 및 집중 검사다. 기존 Firebase/운영 backend 선택은 바꾸지 않는다. 게스트 호출에는 플랫폼 JWT 검사 대신 handler가 매번 proof를 검증한다. Origin allowlist만으로 인증하지 않으며 관리자 credential은 server env에서만 읽는다. 실패 요청에 body/header/proof를 로그로 남기지 않는다.

위험: Storage 작업과 초대 폐기는 서로 다른 transaction이므로 이미 허용된 요청은 폐기 직후 끝날 수 있다. 이미 다운로드한 bytes는 회수할 수 없다. 4 MiB 요청 제한은 총 사용량/rate limit을 대체하지 않는다. 기존 이미지 ID/압축·암호화/metadata는 유지하며 exotic ID는 명시 실패로 처리한다. 실제 hosted Storage/두 계정 HTTP/새로고침 복원은 로컬 mock/정책 결과와 분리한다. 공개/signed URL은 발급하지 않는다.

참고: [Edge 함수 설정](https://supabase.com/docs/guides/functions/function-configuration), [Storage 접근 제어](https://supabase.com/docs/guides/storage/security/access-control).

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
- [x] DB/Storage migration 및 Supabase adapter factory 작성 (운영 적용/실제 입장 연결 미완료)
- [ ] encrypted scene/file 실기기 복구 및 운영 전환

기본 adapter, client invite/CAS worker, scene 권한 SQL/RPC store, private 파일 프록시, 입장 선택 화면 및 통합 Supabase adapter factory를 구현했다. 운영 DB/함수 적용과 relay ticket/실제 입장 연결은 미완성이며 운영 전환도 하지 않았다.

### 통합 adapter와 operation 경계 (2026-10-14, D-024)

`supabase.ts`의 factory는 검증된 invite/client/scope와 필수 `isCurrent`를 받아 세션당 한 번 생성한다. scene writer queue와 private file helper를 공유하며 실제 복원/저장된 요소의 scene version만 socket별 WeakMap에 기록한다. 잘못된 room/key, stale 결과, 읽기 전용 scene 쓰기는 거부하고 Firebase fallback을 하지 않는다. 파일 prefix는 기존 controller의 slash 없는 load 경로와 slash 있는 save 경로만 정확히 허용한다.

controller의 private persistence는 아직 Firebase다. room generation/provider/socket/id/key snapshot을 await 이후 확인하며 이전 응답을 scene/file/status/dialog에 적용하지 않는다. Portal도 암호화 이후 snapshot을 확인해 이전 암호문을 새 socket으로 보내지 않는다. 협업 종료 확인을 취소하면 generation을 무효화하지 않는다. FileManager는 reset generation을 확인해 이전 요청의 finally가 새 요청의 동일 file ID marker를 지우지 않도록 한다. 이미 서버에 전달된 쓰기 자체를 취소하는 보장은 아니다.

- [x] 통합 Supabase adapter factory와 공유 파일 관리자/controller/Portal 경계
- [ ] 실제 입장 시 provider 생성·선택 및 종료/계정 변경 수명주기 연결
- [ ] relay ticket 서명·검증과 read scope의 편집 UI/전송 차단
- [ ] hosted DB/Edge/Storage 적용과 두 실제 클라이언트 복원·재연결

새 방 gate를 유지한다. 읽기 전용 adapter가 저장을 거부하는 것만으로 관찰자 편집/broadcast/종료 경고 동작을 완성한 것은 아니다. 공개 활성화 전 압축 해제 메모리 상한, rate/총 용량 및 인프라 요청 로그를 확인한다.

### relay 입장권 기반 (2026-10-14, D-025)

`supabase/functions/collab-ticket`는 미배포 발급기다. `ticket.ts`는 플랫폼 Web Crypto ECDSA P-256/SHA-256을 사용해 `pct1.<base64url JSON>.<base64url signature>` envelope를 서명/검증한다. private JWK는 Edge에만 두고 relay에는 public JWK만 전달한다. JWT 라이브러리 계약이 아니며 알고리즘 선택은 입력받지 않는다. issuer/audience/version/TTL을 고정하고 추가 claim도 거부한다. room/정확한 Origin/socket challenge/read-write scope를 검증하며 key/proof/invite ID/계정 정보는 ticket에 포함하지 않는다.

HTTP handler는 exact Origin allowlist, POST/OPTIONS, strict 입력 allowlist, 4 KiB stream/10초 body 제한, no-store와 일정한 실패 메시지를 사용한다. Edge entrypoint는 기존 `collab_check_invite`를 anon public key로 호출한다. 로그인·게스트 모두 기존 proof 권한 모델을 적용하고 클라이언트 scope/계정 정보를 신뢰하지 않는다. private key 누락/불량이면 503으로 닫으며 service role은 사용하지 않는다.

다음 relay 구현에서 socket마다 암호학적 random challenge를 발급하고 입장권의 challenge와 Origin/room을 비교한다. 재연결은 새 challenge, 만료는 재승인으로 처리하며 전달 이벤트마다 만료와 write 권한을 확인해야 한다. read 사용자의 scene/file 쓰기·broadcast/follow 요청 권한 및 수신 권한도 별도로 구현한다. 60초 ticket이 이미 발급됐다면 초대 폐기는 즉시 반영되지 않을 수 있다. 브라우저는 ticket을 URL/localStorage/로그에 보관하지 않고 socket 세션 메모리에서만 사용해야 한다.

- [x] 입장권 서명/검증 계약과 HTTP 발급기 및 미배포 RPC entrypoint
- [x] relay challenge/public key verification/갱신/송수신 권한 검사 구현 및 로컬 검증 (운영 미배포)
- [ ] 프론트 입장·provider 연결과 읽기 전용 UI
- [ ] 운영 key 등록/배포·실제 Supabase HTTP 및 두 클라이언트 검증

이번에는 별도 relay 저장소나 운영 설정을 수정하지 않았다. 두 저장소 간 verifier 계약 동기화 방법도 relay 구현 단위에서 기록한다.

### relay 입장 연결 (2026-10-14, D-026)

별도 서버 `src/admission.ts`/`src/index.ts`에서 `COLLAB_TICKET_PUBLIC_JWK`만 import한다. private JWK나 잘못된 공개 키는 거부하고 설정이 없으면 sc_ 방만 닫는다. connection의 `collab-challenge`는 `{challenge}`를 전달한다. 프론트는 검증한 초대 proof로 Edge에 ticket을 요청한 뒤 `join-collab-room({roomId,ticket}, ack)`을 호출하고 `{ok:true}` 확인 이후 편집기를 협업 상태로 전환해야 한다. legacy `join-room`은 기존 hex 방만 받는다.

`renew-collab-ticket(ticket, ack)`은 같은 room/Origin/challenge와 더 늦은 exp만 허용한다. 서명은 입장/갱신 때 검증하고 검증한 immutable grant의 expiry/scope는 모든 송신·수신 및 참여 목록/follow 결과 전달에서 다시 확인한다. 만료 timer는 `collab-expired` 후 연결을 끊는다. event loop에서 timer 처리가 늦어져도 만료된 대상에는 bytes를 전달하지 않는다. read는 reliable/volatile/follow 요청을 보낼 수 없고 write broadcast를 받을 수 있다. 갱신에 따른 read 다운그레이드도 즉시 반영한다.

한 소켓의 검증 요청은 single-flight이며 60초당 최대 10회다. 재연결은 새 challenge로 새 ticket을 발급한다. relay의 `src/ticket.ts`는 Edge 계약의 byte-identical 사본이며 하네스가 이를 확인한다. 동일 계약을 유지하기 위해 signer export도 포함하지만 relay는 verifier만 호출하고 private key는 취급하지 않는다. Node 24 런타임에 맞춰 TypeScript ES2020/CommonJS 출력을 명시했다. multi-process/Redis adapter로 바꿀 때는 현재 local recipient lookup을 다시 설계해야 한다.

프론트 갱신 timer/실패 안내와 read-only UI/provider 수명주기는 아직 연결하지 않았다. 폐기 이후 이미 발급한 ticket은 최대 60초 유효할 수 있다. per-socket 검증 제한은 전역 연결 수/Origin 위조/native client 남용/전송량 제한을 대체하지 않는다. 운영 Render/Edge/DB/키는 변경하지 않았다.
