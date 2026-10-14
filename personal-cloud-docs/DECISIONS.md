# 설계 결정 기록

## D-030: 파일 압축 해제와 Edge 처리 자원 상한

- 이번 단위: 새 Supabase 파일 복원의 압축 해제 중단 한도(4 MiB 데이터 + 64 KiB 메타데이터/래퍼), Edge 파일 120회/분·동시 3개, ticket 240회/분·동시 8개를 각 handler/isolate에 적용한다. 초과 요청은 body/권한/Storage/서명 처리 전에 429로 거부하고 Retry-After를 보낸다. Origin 제한/초대 권한 검사는 그대로 유지한다.
- core 공개 decompressData는 전체 inflate 뒤에만 크기를 알 수 있다. app에서 codec를 복제하거나 암호화 형식을 바꾸는 대안은 upstream 호환 위험이 더 크므로 `packages/excalidraw/data/encode.ts`에 선택적 maxDecompressedBytes API만 추가한다. 지정하지 않은 Firebase/import/export 호출은 그대로다. 기존 pako streaming Inflate로 output 누적 시 즉시 중단한다. core 예외는 이 파일로 제한하고 upstream merge 때 optional API/기본 동작 회귀를 재검사한다. 새로운 dependency는 없다.
- 상한 경로는 실패 시 인코딩 메타데이터/원문을 로그에 출력하지 않는다. 서버 limiter는 카운터만 보관하며 IP/계정/초대/proof를 기록하지 않는다. 슬롯은 finally에서 반환한다. isolate 재시작/스케일아웃으로 제한은 초기화/배수 증가할 수 있으므로 전역 abuse/월 비용 제한이라고 주장하지 않는다.
- 완료 조건: 실제 AES/pako 파일 정상 복원, 경계값·고압축 oversized·비압축·실패 로그·이전 기본 codec 회귀, 요청 한도·회복·동시성·실패 슬롯 반환·CORS/권한 기존 검사, 타입/린트/빌드/guardrails(core 예외 명시). 프로젝트 총 Storage/scene 용량·분산 요청 quota/relay 연결 총량·인프라 로그 정책/hosted 검증은 다음 단위이며 이번에도 운영 flag off/미배포다.
- streaming 근거: 기존 설치 pako 2.0.3 `lib/inflate.js`의 onData/onEnd를 확인하고 고정 크기 출력 callback을 사용했다. 일반 API 참고: https://nodeca.github.io/pako/ (현재 문서는 설치 버전과 다를 수 있으므로 실제 검증은 저장소 설치 버전으로 수행).

## D-029: 소유자 협업 방·초대 관리

- 범위: Milestone 8의 기본 off flag 아래 로그인 소유자의 빈 방 생성/목록, read/write 초대 발급(1시간·1일·7일), 링크 복사, 폐기를 추가한다. 캔버스 복사나 자동 입장은 하지 않는다. 기존 개인 그림/Firebase/운영 설정은 유지한다.
- 키는 열린 관리 화면의 메모리와 기존 초대 URL에만 둔다. DB에는 기존 proof hash만 전송한다. 화면을 닫은 뒤에는 기존 링크를 입력해야 같은 방의 새 초대 발급/링크 복사가 가능하다. 키를 재생성해 기존 방을 덮어쓰지 않는다. 목록은 proof_hash를 조회하지 않는다.
- 복구는 지정한 초대의 proof_hash만 소유자 RLS로 읽어 입력 링크의 HKDF/SHA-256과 비교한다. hash는 UI에 반환/표시하지 않는다. 만료·폐기된 링크도 소유자의 키 복구에는 사용할 수 있지만 이전 초대 권한을 되살리지 않는다. 타 계정은 RLS 때문에 복구에 필요한 행을 읽을 수 없다.
- 생성과 첫 초대는 기존 별도 RPC를 사용한다. 부분 성공/응답 유실에는 동일 room/key/invite/expiry로 재시도하고 충돌 시 RLS로 읽은 소유자 메타데이터를 확인한다. 빈 방이 남을 수 있으며 키는 복구 불가능하므로 화면에 링크 보관 주의를 표시한다. 중복 클릭은 single-flight로 막는다.
- 완료 조건: owner SDK와 관리 UI의 생성/재시도·read/write·만료·폐기·계정 변경/닫기 지연 응답·flag 검사, guardrails/type/lint/build. 새 migration/dependency 없이 기존 RLS/RPC를 사용한다. 실제 hosted 두 계정/relay/파일 검증은 배포 전 후속이며 이번에 활성화하지 않는다. 폐기는 새 요청을 거부하지만 이미 받은 데이터는 회수 불가능하고 연결에는 최대 60초 TTL 지연이 있다.

## D-028: 선택 화면과 Supabase room controller 연결

- 범위 (2026-10-14): 기본 off인 공개 `VITE_COLLAB_SUPABASE_ENABLED` flag 아래 새 입장 API/선택 화면/Portal/session/provider를 연결한다. legacy startCollaboration/Firebase fallback은 새 방에서 호출하지 않는다. 운영 env/DB/Edge/Render는 변경하지 않는다.
- ACK 후 scene read가 성공하고 current room/socket/account/route/generation을 재확인한 뒤 초기 캔버스를 전환한다. 초기 실패/취소에는 기존 scene/files/Cloud baseline을 유지한다. 준비 중 peer scene은 직렬 복호화/최대 64개·8 MiB 제한 queue에 보관해 snapshot 적용 후 reconcile한다. reconnect는 기존 scene과 원격을 reconcile해 미저장 로컬 변경을 자동 버리지 않는다.
- 준비/재연결/read scope는 controlled viewMode로 잠그며 쓰기·파일 업로드·포인터/follow/broadcast/save는 session.canWrite를 확인한다. account 변경/route 변경/close/stop/unmount는 worker/provider/listener/queue를 정리한다. 최초 성공에만 개인 Cloud drawing/baseline을 분리해 협업 scene을 이전 개인 그림에 autosave하지 않는다. read scope는 일반 협업 저장 종료 경고를 띄우지 않는다.
- 완료 조건: 실제 편집기로 ACK 전 원본 보존, 실패/취소·계정 변경/늦은 scene·초기 peer 업데이트/재연결/read/write/provider 선택/cleanup 검사, 기존 입장/협업/저장 회귀 및 타입·린트·빌드·guardrail. 활성화 UI 관찰은 로컬 opt-in/합성 데이터만 사용한다. hosted 두 계정/Storage·scene 파일/최초 room 생성 UI 및 공개 abuse·메모리·로그 정책은 별도이며 이 flag를 운영에 켜지 않는다.
- 빌드 확인: 새 static dependency가 기존 2.3 MiB PWA precache 한도를 넘기므로 Supabase provider/session/ticket request는 입장 시 dynamic import한다. 주 bundle 캐시 제외나 PWA 비활성화로 해결하지 않는다. 기능상 필요한 작은 bundle 증가가 여전히 한도를 넘으면 실제 결과를 기록하고 한도를 최소 상향해 앱 자체의 offline precache를 유지한다.
- dynamic import 후 main bundle은 약 2,412.20 kB로 기존 2.3 MiB 한도보다 약 0.5 kB 크다. app Vite 설정의 precache 한도만 2.4 MiB로 올려 main 및 작은 lazy chunks의 offline 캐시를 유지한다. runtime 캐시/등록 정책/코어 및 dependency는 바꾸지 않는다. typecheck는 Vite 임시 config 생성/삭제와 겹치지 않도록 build 종료 후 실행한다.

## D-027: 프론트 입장권 세션 수명주기

- 범위 (2026-10-14): 실제 캔버스 전환 전 transport 모듈을 먼저 구현한다. 기존 startCollaboration은 ACK 전 resetScene/Firebase fallback을 수행하므로 그대로 우회하지 않는다. 이번 모듈은 Supabase client/검증된 invite와 현재 작업 callback으로 ticket을 요청하고 socket challenge별 join/renew ACK 후에만 ready로 표시한다. 기존 선택 화면/provider/새 방 잠금과 운영 설정은 유지한다.
- ticket의 strict claim 검사는 UI/만료 시각 힌트일 뿐 서명 권한 판단은 relay ACK가 맡는다. room/Origin/challenge/issuer/audience/version/60초 TTL/scope/크기 검사 후 ready. 서버와 브라우저 시계 차이/갱신 실패는 fail-closed로 연결을 종료하고 원문 오류를 표시하지 않는다. ticket/key/proof는 URL/storage/log에 저장하지 않는다.
- 갱신은 30초 전, 로컬 hard-expiry timer와 visibility 복귀 재확인, 소켓 generation/single-flight/ACK timeout을 적용한다. disconnect는 ready를 해제하고 재연결 때 새 challenge로 다시 발급한다. stale ticket/ACK는 새 socket에 보내거나 적용하지 않는다. scope 변경은 성공한 갱신 ACK 후 콜백으로 알리고 ready callback 완료 전 writable을 열지 않는다. read grant는 canWrite=false다.
- 완료 조건: 실제 WebCrypto로 만든 ticket 및 mock Socket/Supabase를 사용해 요청 body·unknown response·single-flight·읽기 전용·갱신·만료·권한 변경·닫기·지연 응답·재연결·background 복귀 검증. 실제 loopback relay와 이 worker를 연결하는 검사도 추가한다. 다음 단위는 선택 화면/controller의 ACK 후 원격 scene 적용·provider·read-only viewMode 연결/실패 시 현재 scene 보존이다. 이번만으로 UI 협업 입장 완료라 하지 않는다.

## D-026: relay socket 입장·갱신·전송 경계

- 범위 (2026-10-14): 별도 relay 저장소에 sc_ room join/renew acknowledgement, socket별 32-byte random challenge, 공개 P-256 JWK 검증을 연결한다. 공개 키 없으면 새 방만 닫고 legacy hex room은 유지한다. private key/JWT/proof를 relay에 전달하지 않는다. 이번에는 배포/프론트 연결을 하지 않는다.
- 서명 verifier는 발급기 ticket.ts와 byte-identical 사본으로 관리하고 하네스에서 일치를 검사한다. signer export는 계약 동기화를 위해 포함되지만 relay에서는 호출하지 않고 private key를 import하지 않는다. 추가 dependency 없이 Node 24 Web Crypto를 쓴다.
- 검증한 ticket의 scope/expiry를 서버 세션에 저장하고 모든 송수신·참여 목록·follow 전달에서 expiry/membership를 동기 재확인한다. 60초 만료 timer는 연결을 종료하며 이벤트 루프 지연 때도 수신자를 필터한다. 갱신은 같은 room/Origin/challenge의 새 서명/더 늦은 expiry만 허용한다. 동시 검증 single-flight와 socket당 60초/10회 시도 제한을 둔다.
- read scope는 암호문 수신만 허용하고 reliable/volatile/follow 송신은 차단한다. write와 read 다운그레이드는 새 ticket에 따른다. 재연결은 새 challenge를 요구하며 이전 socket ticket은 재사용하지 않는다. 이미 전달한 bytes는 회수할 수 없고 폐기 반영은 최대 TTL 지연이다.
- 완료 조건: relay build/lint, 실제 loopback Socket.IO 클라이언트의 read/write·위조·만료·갱신·재연결·다른 방/Origin/challenge 검사 및 legacy 하네스. 서버는 단일 프로세스/in-memory adapter 범위다. 전체 남용/연결 수 제한·공개 부하/배포·실제 Supabase 발급·브라우저 UI는 후속이다.
- 빌드 호환: byte-identical Web Crypto 계약의 typed array iteration을 보존하려고 relay TypeScript target을 ES5에서 ES2020으로 변경한다. 기존 배포 런타임 Node 24 범위 안이며 dependency/lockfile 변경은 없다.

## D-025: relay 입장권 서명 계약

- 결정 (2026-10-14): Web Crypto ECDSA P-256/SHA-256의 비대칭 서명을 사용한다. Edge 발급기만 private key를 보유하고 relay에는 public key만 둔다. 새로운 dependency 없이 플랫폼 crypto API를 사용하며 JWT로 위장하지 않는 고정 버전 envelope를 정의한다. 참고: https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/sign
- 입장권은 issuer/audience/version, sc_ room, 서버 확인 read/write scope, 정확한 Origin, relay socket challenge, issued/expiry를 담는다. key/proof/invite ID/계정 정보는 담지 않는다. TTL은 60초 고정이며 relay는 수신 시와 모든 전달/입장 시 만료·room·Origin·challenge를 재검사해야 한다. challenge는 향후 relay가 socket마다 임의 발급하고, 재연결에는 새 입장권이 필요하다.
- 이번 범위: 독립 signer/verifier와 제한된 Web Request 발급 handler, 초대 RPC를 호출하는 미배포 Edge entrypoint, 실제 crypto 기반 위조/다른 key/room/Origin/challenge/만료/권한/입력 검사. private JWK는 Edge env만 사용하고 잘못된 설정은 503으로 닫는다. service role은 필요 없다. key 배포, relay 연결 및 renewal/read-only 전송 제한은 후속이다. 미연결 단계에서 새 방 gate를 열지 않는다.
- 완료 조건/위험: 발급기는 strict request allowlist/4 KiB stream/10초 읽기 제한/CORS/no-store/오류 비노출을 적용한다. 잘못된 scope나 초대 거부는 서명하지 않는다. 요청 및 ticket 원문을 로그에 남기지 않는다. 짧은 입장권만으로 즉시 초대 폐기를 보장하지 않으며 폐기 이후 최대 TTL까지 유효할 수 있다. 공개 활성화 전 주기적 재승인/전송 제한/rate/로그 정책을 완료한다.

## D-024: 통합 Supabase adapter와 controller operation 경계

- 추가 확인: 공유 app FileManager를 reset 후 재사용하면 오래된 요청의 finally가 새 방의 같은 ID fetching/saving marker를 삭제할 수 있다. app helper에 reset generation을 추가해 stale 결과/정리/상태 통지를 차단한다. core는 바꾸지 않고 Cloud autosave/초안 회귀도 함께 실행한다. stop 확인 취소는 세션을 무효화하지 않는다.

- 결정 (2026-10-14): scene CAS/store와 private 파일 계약을 하나의 CollabPersistence factory로 합친다. factory는 room/invite/scope와 현재 operation callback에 묶고 한 room session마다 한 번 생성한다. 기존 Firebase 기본 선택은 유지하며 controller의 private persistence instance 경계만 준비한다. relay ticket/운영 적용/새 방 시작은 후속이다.
- cache는 socket별 복호화한 scene version을 사용해 기존 isSaved 계약을 유지한다. 오류/다른 room/key/stale 결과를 저장 성공으로 처리하지 않는다. read scope에서는 scene/file 쓰기를 요청하지 않고 명시 오류/파일 실패로 반환한다. 파일 load의 기존 slash 없는 prefix와 save의 slash prefix를 모두 정확히 허용하며 임의 경로 normalize는 하지 않는다.
- controller와 Portal의 비동기 결과에는 room/key/socket/provider/generation snapshot을 적용한다. 시작/종료/소켓 파기/컴포넌트 종료로 generation을 무효화하고 await 후 현재 작업인지 확인한다. 이미 전송된 Firebase 최종 저장 자체를 취소하지 않으며 오래된 scene/file/status/error를 새 방에 적용하지 않는다.
- 완료 조건: 통합 adapter scene/file/read-only/cache/실패·stale 테스트, 실제 편집기 controller 늦은 응답 검사, 관련 기존 회귀/타입/린트/빌드. 이 단위는 운영 Supabase 연결이나 실제 relay 입장 완료가 아니다. file inflate 중 메모리/rate 제한과 ticket 발급·relay 검증은 새 방 활성화 전 유지한다.

## D-023: 초대 검증 파일 프록시와 private bucket

- 결정 (2026-10-14): Supabase Edge Function의 파일 프록시가 upload/download마다 기존 collab_check_invite로 proof/room/만료/폐기/scope를 검사한다. 게스트 때문에 이 새 함수만 플랫폼 JWT 검사 없이 호출할 수 있게 구성하되 내부 초대 검증은 필수다. 실제 배포/설정 변경은 이번 범위가 아니다.
- collab-files는 private, 최대 4 MiB application/octet-stream bucket이다. anon/authenticated의 직접 Storage 접근은 restrictive RLS로 차단한다. 서버 전용 관리자 credential은 Edge env에만 두고 브라우저/fixture/log에 넣지 않는다. Origin은 명시 allowlist이며 권한 인증 대체가 아니다. 공개/signed URL을 발급하지 않고 매 요청 확인 후 bytes를 프록시해 폐기 후 새 다운로드 요청을 거부한다. 이미 받은 bytes와 이미 허용된 실행 중 작업은 회수하지 못한다.
- 클라이언트가 전달한 owner/path/URL은 받지 않는다. room namespace/초대 UUID/proof/operation/file ID/schema/크기를 검증하고 서버가 room/file ID 경로를 만든다. supported file ID는 기존 SHA-1/nanoid와 legacy 단일 segment(1~128 ASCII 영숫자/underscore/hyphen)를 유지하며 다른 ID는 오류로 보고하고 재작성하지 않는다.
- 기존 FileManager encoder의 암호화·압축 bytes와 upstream decompressor/metadata를 그대로 사용한다. file ID 경로 덮어쓰기는 기존 Firebase의 retry/upsert 동작과 같고 다른 room은 격리한다. 파일별 부분 성공/실패를 유지하며 삭제/정리는 하지 않는다. 일반 Cloud 초안/Storage와 구분한다.
- 완료 조건: bucket/RLS migration, 순수 Web Request 기반 파일 gateway와 서버 env entrypoint, client save/load 구현, 실제 encode/decode 및 오류/권한/크기/다른 room/부분 실패 검사. Deno entrypoint와 PostgreSQL 정책 검사를 앱 타입 검사와 구분한다. 전체 adapter/controller/relay ticket/운영 적용/실기기 이미지 새로고침은 후속이다. 무료 범위를 유지하며 요청/총 용량 rate limit과 운영 body/header 로그 검토 전 활성화하지 않는다.

## D-022: 초대 입장 선택 화면과 OAuth 복귀

- 결정 (2026-10-14): 새 provider/초대/sc_ URL은 앱 초기화와 기존 Collab 시작에서 차단하고 로그인/게스트 선택 화면으로 보낸다. 잘못된 route도 기존 Firebase로 fallback하지 않는다. 초기 local scene은 유지하고 실행 중 URL 전환에서는 현재 canvas를 교체하지 않는다.
- 게스트 검증에는 기존 Workspace 세션과 분리된 nonpersistent Supabase client를 사용한다. 로그인은 기존 세션 또는 Google OAuth를 사용하고 두 모드 모두 collab_check_invite RPC proof 검증을 받는다. 화면 선택값만으로 권한을 허용하지 않는다.
- OAuth redirectTo는 origin뿐이다. 복귀 URL의 room key는 같은 탭 sessionStorage에 5분만 보관하고 로그인 완료 시 한 번 소비한다. 같은 origin/path와 검증된 초대 형식만 복원하고 외부 주소/만료/잘못된 값은 삭제한다. 다른 문서/공유 링크를 보고 있으면 자동 복귀하지 않는다. storage 실패나 OAuth 오류를 알리고 키/본문은 로그로 남기지 않는다.
- 완료 조건: 선택/검사/오류/재시도/닫기 화면, URL·auth 전환/느린 응답 무효화, 로그인 복귀 검사, 실제 App 회귀/기본 타입·린트·빌드. 이번에는 RPC 검증 성공을 방 접속 성공으로 표시하지 않는다. DB 운영 적용, Storage와 전체 adapter, relay ticket 구현 전 새 협업 시작은 계속 잠근다.

## D-021: 초대 검증 RPC와 scene CAS 서버 경계

- 결정 (2026-10-13): 별도 유료 gateway 대신 Supabase PostgreSQL RPC가 scene 요청마다 room/invite/proof hash/만료/폐기/scope를 검사한다. 로그인/게스트 모두 동일한 bearer 초대 검증을 거치며 로그인만으로 타인의 방 권한을 얻지 않는다.
- room/초대 생성·폐기는 auth.uid()로 owner를 확인한다. room/invite는 owner SELECT만 허용하고 scene 및 모든 직접 쓰기는 anon/authenticated에 GRANT하지 않는다. SECURITY DEFINER 함수는 빈 search_path, 명시적 schema, 기본 PUBLIC/anon/authenticated EXECUTE 회수 후 필요한 함수만 허용한다.
- scene은 최대 2 MiB 암호문/12-byte IV와 safe integer revision으로 제한한다. CAS 생성은 1, 갱신은 expected + 1, 충돌은 명시 반환한다. room/초대 잠금으로 폐기와 진행 중 저장을 직렬화한다. 이미 완료된 요청/다운로드는 회수하지 못한다.
- 이번 완료 조건: additive migration 작성, RPC client byte 변환/응답 검증/권한 오류 처리와 집중 테스트, rollback DB 검사 준비. 실제 DB 적용·HTTP 두 계정/게스트·Storage·relay ticket·입장 UI는 별도이며 준비 전 새 방을 활성화하지 않는다. RPC는 HTTP body로 proof를 받으므로 인프라 request-body/SQL parameter 로그에 비밀이 남지 않도록 운영 설정 검토가 필요하다. rate limit/총 저장 용량 정책도 운영 활성화 전 후속이다.

## D-020: 로그인/게스트 선택과 초대 기반 권한

- 사용자 결정 (2026-10-13): 새 방 입장 시 로그인 참여와 게스트 참여 모두 제공한다. 로그인은 신원 선택이며 두 방식 모두 유효한 초대 권한을 검증한다. room 생성/초대 발급·폐기는 로그인 owner만 한다.
- 새 Supabase room은 `sc_` namespace를 사용해 기존 20자리 hex Firebase room과 구분한다. 기존 `#room=id,key` 형식은 유지하고 provider/비밀이 아닌 invite UUID만 query로 둔다. 현재 relay는 sc_ 방을 거부하며 새 방은 backend/auth/입장 UI가 준비될 때까지 생성·활성화하지 않는다.
- roomKey는 클라이언트에만 둔다. Web Crypto HKDF로 room/invite에 종속된 별도 256-bit bearer proof를 파생하고 DB에는 proof의 SHA-256 hash만 저장한다. backend가 만료/폐기/room/scope를 매 작업 검증해야 한다. proof 자체도 비밀이며 로그/URL/fixture에 넣지 않는다. HTTP body/TLS로만 전달한다.
- 실시간 relay 입장도 새 namespace에서는 검증된 단기 입장 ticket이 필요하다. persistence 권한만으로 실시간 접근을 보호했다고 주장하지 않는다. 게스트 세션은 별도 인증 gateway가 검증하며 anon table CRUD/공개 bucket은 허용하지 않는다. 저장은 브라우저 복호화/reconcile/재암호화와 DB 원자적 CAS로 처리한다.
- 이번 범위: 순수 초대 route/proof 처리와 암호화 scene single-flight/CAS 저장 worker 및 테스트. DB/RLS/gateway/선택 UI/새 provider 연결은 후속이며 현재 Firebase/운영은 유지한다.

## D-019: 협업 persistence 계약과 Firebase 호환 adapter

- 결정일: 2026-10-13, Milestone 8 첫 단위. 기존 다섯 persistence 함수를 명시적 계약과 기본 Firebase adapter로 묶고 Collab 호출부만 연결한다.
- 기존 transaction reconcile/cache/암호화/FileManager queue는 그대로 유지한다. 파일 업로드와 scene 저장 결과 및 오류를 변환하지 않는다. 공개 API 이름/legacy 링크, ShareDialog Firebase 경로는 유지한다.
- 검증: adapter의 입력/결과/오류 전파, 저장 상태 및 파일 부분 실패, 기존 협업 회귀/typecheck/lint/build. 네트워크 순서/저장 구현이 바뀌지 않으므로 새로운 live 장애 주입은 생략하며 이 검사가 Firebase 실서비스 검사라고 기록하지 않는다.
- 후속 Supabase의 권한/route/CAS는 collaboration-persistence.md의 설계 후보다. 이 단계에서 anon 권한 확대, migration, backend 전환, 유료 서비스는 하지 않는다.

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

### Orphan file 정리 정책 (설계만, 실행 인프라는 별도 작업)

지금 코드는 파일을 절대 능동적으로 지우지 않는다 (`fileAdapter.ts`는 업로드/
다운로드만 하고 delete는 없음). 아래 두 종류의 orphan이 시간이 지나면서
쌓인다.

1. **그림이 삭제된 경우**: `drawing_files`는 `drawings`에 `on delete cascade`가
   걸려 있어 metadata row는 자동으로 없어지지만, Storage object(실제 바이트)는
   cascade 대상이 아니라서 그대로 남는다. → `storage.objects`를 순회하며
   `drawing_files.storage_path`에 더 이상 존재하지 않는 경로를 찾아 지운다.
   drawing 삭제 시점에는 metadata가 이미 사라졌으므로 grace period 없이 바로
   지워도 안전하다 (참조할 대상 자체가 없다).
2. **그림은 남아 있지만 이미지 element가 지워지거나 다른 파일로 교체된 경우**:
   `drawing_files` row는 지금 로직상 계속 남는다 (저장은 upsert만 하고 delete는
   안 하므로). → 주기적으로 각 `drawing_files` row의 `file_id`가 해당
   `drawings.scene_data.elements`(삭제되지 않은 것)에 아직 참조되는지 확인하고,
   **일정 유예 기간(예: 7일)** 이상 참조가 끊긴 상태가 유지된 것만 지운다.
   즉시 지우지 않는 이유는 undo/히스토리, 혹은 Milestone 6의 최소 version
   history가 예전 버전의 이미지를 다시 참조할 수 있기 때문이다
   (ENGINEERING_GUARDRAILS.md #9).

실행 방법은 아직 정하지 않았다 — 후보는 Supabase의 pg_cron + Edge Function
(service role 필요, 브라우저 코드가 아니라 서버 쪽에서만 실행) 또는 수동으로
가끔 실행하는 관리 스크립트다. 브라우저 클라이언트 코드에는 이 정리 로직을
절대 넣지 않는다 — service role 없이는 다른 사용자의 orphan을 볼 권한도 없고,
클라이언트가 "정리"를 자임하게 하면 진행 중인 다른 세션의 파일을 실수로 지울
위험이 있다. 실제 구현은 이 정책이 실제로 필요해지는 시점(스토리지 용량이
문제가 되거나 Milestone 6 MVP 검증 단계)에 별도로 진행한다.

## D-012: 최소 Version History

- 상태: 결정
- 결정: Google Docs/Sheets의 버전 기록을 단순화한 모델을 쓴다 — operation
  로그가 아니라 **snapshot 기반**, 이름 붙은 버전이나 시간대별 thinning 없이
  **그림당 최근 50개**만 rolling window로 보관한다.
- 구현 방식: 클라이언트가 아니라 **`drawings` table의 `BEFORE UPDATE` Postgres
  trigger**가 scene_data가 실제로 바뀔 때마다 "덮어써지기 직전 상태"를
  `drawing_revisions`에 자동으로 남기고, 같은 트리거에서 오래된 것부터 50개
  초과분을 지운다.
- 근거:
  - autosave, 충돌 해결(덮어쓰기), 향후 생길 수 있는 다른 저장 경로까지
    **경로에 상관없이 빠짐없이 기록**하려면 클라이언트마다 "저장 성공하면
    history도 남기기"를 반복 구현하는 것보다 DB가 한 곳에서 보장하는 게
    안전하다 (여러 곳에서 각자 기록하면 하나라도 빠뜨리기 쉽다).
  - `authenticated` role에는 `drawing_revisions`에 대한 `select`만 GRANT하고
    `insert`/`update`/`delete`는 주지 않는다. 쓰기는 `security definer`
    trigger 함수만 할 수 있다 — 클라이언트가 자기 히스토리를 조작(위조된
    과거 버전 삽입, 임의 삭제)할 수 없게 막는다.
  - 50개 고정 개수는 구글의 "최근은 촘촘히, 오래된 건 듬성듬성"보다 훨씬
    단순하지만, "최소" 버전 히스토리의 목적(최근 실수 복구)에는 충분하고
    구현/설명 비용이 훨씬 낮다.
- 영향: 복원(restore)은 새 UPDATE이므로 트리거가 다시 실행돼 "복원 직전
  상태"도 자동으로 히스토리에 남는다 — 즉 복원조차 되돌릴 수 있다. 미리보기
  UI는 이번 범위에 넣지 않는다(목록에서 바로 복원, 확인 dialog로 실수 방지).
- 결정일: 2026-08-21 (사용자가 보관 개수 50으로 결정한 시점)

## D-013: 이미지까지 완료된 저장 상태

- 상태: 결정 (2026-10-03)
- 완료 조건: scene 저장과 이미지 업로드가 모두 성공해야 `saved`로 표시한다. 업로드 중과 부분 실패를 표시하고, 그림을 수정하지 않아도 실패한 파일을 재시도할 수 있다.
- 구현: 기존 문서별 FileManager를 사용하며 업로드까지 single-flight 범위에 포함한다. scene revision 성공은 별도로 반영하므로 파일 재시도 때문에 scene을 다시 UPDATE하지 않는다.
- 위험과 검증: 문서 전환/동일 문서 재열기 generation, 느린 업로드 중 후속 변경, 반환된 erroredFiles, Promise 거절, offline, revision 충돌을 검사한다. 실패하거나 더 최신 변경이 있으면 로컬 초안을 삭제하지 않는다.
- 범위 제외: 초안 저장소는 scene/app state만 보관한다. 이미지 binary의 문서별 offline 복구 보장은 별도 작업이며 이번 수정만으로 새로고침 후 미업로드 이미지 복구를 보장하지 않는다. DB migration과 upstream core 변경은 없다.

## D-014: 이미지가 포함된 문서별 로컬 초안

- 상태: 결정 (2026-10-04), Milestone 6
- 완료 조건: 초안의 element/app state와 참조 BinaryFiles를 하나의 IndexedDB 레코드로 저장한다. 업로드 실패 뒤 재열기에서 이미지까지 복원하고 다시 업로드할 수 있어야 한다. scene이 원격과 같아도 원격에 없는 이미지 bytes가 있으면 복구를 제안한다.
- 호환성: 기존 `files` 없는 초안을 읽을 수 있도록 optional 필드를 추가한다. 서버 DB migration이나 dependency 추가는 하지 않는다. 다른 문서의 파일을 가져오지 않으며 로컬 데이터는 해당 브라우저 origin에만 남는다.
- 비동기 규칙: 초안 조회/이미지 다운로드/복원 뒤 drawingId와 generation을 검사한다. 복구 선택까지 autosave를 잠그고, 실패한 로컬 저장은 UI에 알린다. 성공 후 초안 삭제는 해당 snapshot token과 일치할 때만 같은 transaction에서 실행한다.
- 검증: 저장소 구현을 mock하지 않고 fake-indexeddb 환경의 IndexedDB API로 bytes 보존/구버전 호환/문서 분리/조건부 삭제를 검사한다. 업로드 실패 후 같은 scene 복구, 재시도, stale 응답, quota 실패, 종료 전 flush를 자동 테스트한다. 실제 Safari 디스크 내구성 검사는 별도다.
- 한계: 브라우저 강제 종료 전에 끝나지 않은 transaction, 저장소 삭제/eviction, 다른 origin/기기 복구는 보장하지 않는다. 파일을 매 이벤트 복사하지 않고 debounce worker에서 필요한 파일만 보관한다. 전체 drawing backup/export는 다음 작업이다.
- 2026-10-06 기록 정리: 이미지 포함 현재 그림 백업은 D-015에서 검증했다. Safari 탭 한정 업로드 실패 후 일반 탭 재열기/초안 복구/재업로드는 확인했지만, 이후 URL 새로고침의 빈 캔버스는 미해결이다. 이 관찰만으로 프로세스 강제 종료 내구성이나 데이터 유실을 확정하지 않는다.

## D-015: 현재 그림의 이미지 포함 백업 검증

- 상태: 자동 및 Safari 다운로드/복원/새 Cloud 그림 저장 검증 완료 (2026-10-04), Milestone 6
- 범위: 현재 캔버스의 전체 `.excalidraw` 파일 및 PNG/SVG export를 기존 upstream serializer/export/import API로 검증한다. 새 백업 schema나 dependency는 만들지 않는다.
- 완료 조건: Cloud의 database scene과 별도 이미지 bytes를 합친 캔버스를 파일로 저장하고, 빈 편집 상태에서 이미지/element/app state를 복원할 수 있다. SVG에는 이미지 bytes가 포함되고, 편집 데이터 포함 PNG/SVG도 복원 가능해야 한다. 관련 자동 테스트와 Safari 수동 결과를 구분해 기록한다.
- 위험: database JSON에는 이미지 bytes가 없으므로 단독 백업으로 취급하지 않는다. 선택 영역 export는 전체 백업이 아니며, 파일 다운로드 전 미복원 이미지는 확인해야 한다. 일반 PNG/SVG는 편집 데이터를 포함하지 않으면 scene 복구본이 아니다.
- 범위 제외: 계정 전체 그림 일괄 export/import, 버전 기록/권한/Cloud ID 보존은 별도 기능이다. 원본 Cloud 그림을 덮어쓰지 않는 새 그림 복원 절차를 운영 문서에 기록한다.

## D-016: Cloud URL 열기와 편집기 초기화 경계

- 상태: 로컬 구현 및 자동/Safari 새로고침 검증 완료 (2026-10-09), Milestone 6
- 완료 조건: 편집기의 initialData 적용이 끝난 뒤 Cloud URL을 연다. 초기화가 느려도 원격 scene을 빈 local scene으로 교체하지 않는다. 로그인 전환/문서 전환/Strict Mode의 기존 generation 방어를 유지한다.
- 설계: 공개 API의 getAppState().isLoading과 onChange 구독으로 편집기 준비를 확인한다. Promise resolve만으로 core 초기화 완료를 추정하지 않는다. Cloud 문서가 연결된 탭에는 다른 탭의 전역 LocalData scene/file 동기화를 적용하지 않는다. 익명 local-first 및 기존 공유/협업 흐름은 유지한다.
- 검증/위험: 실제 Excalidraw와 지연된 initialData를 연결한 회귀 검사, 이미 초기화된 편집기, 계정/문서 전환, Safari 새로고침/이미지 복원을 확인한다. 이 순서 경합은 코드에서 확인 가능한 결함 후보이며 Safari 증상의 유일한 원인이라고 사전에 단정하지 않는다. DB/upstream core/dependency는 변경하지 않는다.
- 결과: 수정 전 실제 편집기 회귀 테스트에서 최종 element가 빈 배열로 덮이는 실패를 확인했다. 수정 후 초기 인증 상태 두 경우와 Safari 반복 새로고침/새 탭이 정상이다. 전역 LocalData 동기화 차단 및 지연된 로컬 파일의 generation 검사도 추가했다. 서로 다른 local scene의 두 탭/느린 파일 실기기 검사는 별도다.

## D-017: 기능 우선 Workspace와 개인 메뉴

- 결정일: 2026-10-09. 사용자 요청으로 심화 테스트를 보류하고 폴더/검색부터 구현한다.
- 첫 범위: 한 단계 폴더 CRUD, 그림별 단일 폴더 배치, 미분류와 제목 검색. 중첩 폴더/공유/일괄 작업은 별도다.
- 데이터: folders와 drawing_folders 관계 테이블을 추가한다. 기존 drawings의 scene/revision/schema를 바꾸지 않아 이전 프론트/PWA와 공존한다. 폴더 삭제는 관계만 cascade하며 그림/이미지는 보존한다.
- 권한: folders owner RLS, 관계에는 폴더와 그림의 소유권 모두 검사한다. client owner 입력은 사용하지 않는다. migration 미적용 때 기존 그림 목록은 유지하고 폴더 조작은 잠근다.
- 메뉴: app의 MainMenu 구성에서 사용자 지정 6항목만 제외한다. core, 개인 Cloud 로그인, 내보내기, 협업은 유지한다. 상단 배너/command palette는 이번 메뉴 요청 범위 밖이다.

## D-018: 자체 협업 transport의 독립 저장소

- 결정일: 2026-10-09, Milestone 7 착수.
- 공식 excalidraw-room을 별도 개인 저장소로 fork/clone하고 upstream을 등록한다. 검증된 Socket.IO relay를 사용하며 이 앱의 packages와 dependency는 수정하지 않는다. 서버 전용 dependency는 공식 서버의 lockfile을 따른다.
- 로컬 서버는 앱의 기존 개발 endpoint인 localhost:3002에 연결한다. 로컬 실행은 loopback만 허용하고 공개 배포는 별도로 진행한다.
- transport는 암호화된 bytes를 전달하며 room key/평문 scene은 서버에 저장하거나 로그로 남기지 않는다. join/broadcast room membership 검사를 서버 코드에서 확인한다. 링크를 가진 참여자 모델과 계정별 Cloud RLS는 별개다.
- Firebase scene/file persistence와 기존 autosave 협업 잠금은 유지한다. Supabase 협업 persistence, 공개 호스팅/계정 생성/유료 플랜은 이번 로컬 구현 범위에서 제외한다.
- 완료 조건: 두 실제 Socket.IO 클라이언트의 join/암호문 전달/다른 room 격리/재접속과 기존 앱 협업 회귀 검사를 통과하고 재기동 가이드를 남긴다. 실제 브라우저 동시 편집/공개 endpoint 전환은 별도 결과로 기록한다.

### 공개 배포 준비 (2026-10-09)

### 운영 endpoint 전환 (2026-10-13)

공개 서버를 연결한 localhost:3003 합성 두 브라우저에서 양방향 편집과 새로고침 재참여를 확인했다. root `.env.production`의 기존 공개 `VITE_APP_WS_SERVER_URL` 한 줄만 개인 HTTPS relay로 바꾼다. 별도 중복 env adapter보다 기존 upstream 설정 경로를 유지하는 최소 설정 변경이며 `packages/*`와 Firebase 설정은 건드리지 않는다. 운영 Vercel override 유무/배포 Source/실제 bundle endpoint를 확인하며, 필요하면 이전 공식 URL로 재빌드해 롤백한다. 실제 sleep 뒤 복구는 미검증이고 무료 계정/Origin 제한은 유지한다.

Socket.IO의 새 타입 선언은 TypeScript 4.2에서 파싱되지 않으므로 서버 빌드 도구를 앱과 같은 5.9.3으로 올린다. 기존 dependency 범위 안의 socket.io-adapter도 2.5.8로 갱신해 ws 8.21 계열 보안 수정이 반영되도록 한다. 별도 강제 resolution이나 새 runtime dependency는 추가하지 않는다.

공식 서버는 build/lint 도구까지 dependencies에 넣고 있었다. audit의 전체 경고를 runtime 노출로 단정하지 않고 devDependencies로 분리한다. 기존 Express 4/Socket.IO 4/debug 4의 최신 patch/minor를 registry에서 확인해 업데이트하며 lockfile을 갱신한다. 새 라이브러리는 추가하지 않는다. 컨테이너는 build 단계에 개발 도구를 설치하고 실행 단계에는 production dependencies만 설치한다. 전체 개발 도구 경고가 남으면 수를 기록하고 공개 배포의 runtime 감사와 구분한다. Render Free 설정 초안은 자동 배포를 끄고 작성만 하며 실제 서비스/계정/요금 승인과 운영 endpoint 전환은 별도다.
