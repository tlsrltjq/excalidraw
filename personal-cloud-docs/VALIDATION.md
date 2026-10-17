# MVP 검증 기록

## 2026-10-17 선택 도형의 AI 단계·연결 추가

- 범위: `codex/ai-structure-additions`, D-035. 신규 `ai/structureEditor.ts`와 테스트, 기존 schema/client/preview helper/dialog·UI tests, loopback `/extend`와 HTTP tests, 개인 문서를 변경했다. core/dependency/DB/relay/운영 배포·요금은 바꾸지 않았다.
- 앱 범위 `yarn test:app --watch=false excalidraw-app --minWorkers=1 --maxWorkers=2`: 38파일/367개 통과(신규 19개). alias/수량/중복·자기 연결/없는 참조/분리 노드/금지 필드, 선택한 기준 문구만 전송·명시적 적용, 실제 편집기 원본 불변성/기존 geometry·index·선택 밖 보존/상호 binding·이동 후 연결 유지/backup 실패·stale scene·선택·read-only/한 번 undo·redo를 확인했다. Mermaid 변환과 PNG는 단위 테스트에서 mock하며 아래 실제 Safari 결과로 보완했다.
- loopback HTTP 하네스 `node --test personal-cloud-harness/check-local-ai.node-test.mjs`: 9개 통과. 기존 생성·문구 수정의 보안/예산/취소 회귀와 extension 입력 context·금지 출력/참조 거부를 검사했다. HTTP provider는 합성 mock이다.
- `yarn test:typecheck`, 전체 `yarn test:code`, `yarn build` 및 guardrails/diff 검사 통과. 기존 Node MODULE_TYPELESS/DEP0169, MetaProperty lint·Firebase config/font/chunk/Browserslist 경고는 남아 있다. 최초 타입 검사에서 anchor type guard와 PNG의 nondeleted 타입을 보완한 뒤 재검사했다. 전체 upstream suite/운영 DB·두 계정·협업/모바일·다른 기기/실제 Cloud 저장·장애 주입은 변경 범위 밖으로 생략했다.
- Safari 실제 확인: 비로그인 로컬 합성 아키텍처의 DB 사각형을 선택하고 설치된 `qwen3.5:9b`에 재시도 단계 한 개를 요청했다. 처음 생성이 거부돼 합성 직접 모델 진단을 수행했고 요청보다 많은 단계 및 분리 노드 생성 사례를 확인했다. 검증을 완화하지 않고 최소 추가/개수 준수 지시와 유효한 한 단계 예시를 보완했다. 이후 실제 `DB → 실패 → 재시도` PNG 미리보기·적용 성공, 기존 서버→DB 연결 보존, 한 번 undo로 추가 부분만 제거·redo 복원을 확인했다. 모델 품질/항상 성공은 보장하지 않는다.
- 임시 증거: `/tmp/personal-excalidraw-ai-structure-preview.png`, `/tmp/personal-excalidraw-ai-structure-applied.png`. Git에 넣지 않는다. 이번 backup 다운로드/재가져오기는 생략하고 기존 IndexedDB/파일 포함 snapshot 자동 검사와 구분한다. 모델 11434/bridge 3004/앱 3006은 로컬 체험용으로 유지한다.
- 한계: 기준 하나, frame 밖의 잠기지 않은 사각형/다이아몬드/타원만 지원한다. 새 노드만 배치하고 전체 그림 오른쪽에 추가하므로 기존 두 단계 사이 삽입/기존 연결 교체·삭제·재배치/장애물 회피는 하지 않는다. PNG는 기준과 추가 부분만 보여 기존 그림과의 교차를 전부 보여주지는 않는다. 대화 이력/원격 AI/운영 활성화는 후속이며 백업은 기존 AI와 문서별 마지막 하나를 공유한다.

## 2026-10-17 선택 문구 로컬 AI 수정

- 범위: `codex/ai-label-editing`, D-034. 신규 `ai/labelEditor.ts`와 실제 편집기 테스트, 기존 AI schema/client/dialog/style/UI·schema test, loopback `/edit-labels`와 HTTP test, README/ROADMAP/DECISIONS/ai-gateway/operations/본 기록을 변경했다. 기존 생성 API/보안 경계·무료 로컬 전용을 유지하고 core/dependency/DB/relay/운영 endpoint·요금은 변경하지 않았다.
- 앱 범위 `yarn test:app --watch=false excalidraw-app --minWorkers=1 --maxWorkers=2`: 37파일/348개 통과(이전 331개 대비 신규 17개). alias/잘못된 참조·중복/unknown field/개수·텍스트 길이 거부, UI 대상 문구만 전송/전후 비교/명시적 적용·선택 없음 거부, 실제 편집기 bound/free/arrow 텍스트 수정·원본 불변성과 선택 밖 보존·도형 geometry/binding 유지, font fit/최소 크기 거부·stale scene/선택·read-only/backup 실패·한 번 undo/redo를 확인했다. 원래 API 변환이 ID를 재생성하는 fixture와 view mode가 선택을 해제하는 테스트 순서를 보완했고 최종 재실행은 통과했다.
- 실제 loopback HTTP 하네스 8개 통과(기존 6개+수정 2개): 기존 Host/Origin/token/취소/single-flight/예산 유지, 수정 요청의 alias/문구만 upstream 전달, 실제 ID·없는 alias 거부, 생성과 수정의 합산 분당 6회 제한을 검사했다. provider는 합성 mock이며 모델 의미 정확성은 검사하지 않는다.
- 최종 `yarn test:typecheck`, `yarn test:code`, `yarn build` 및 PWA precache 62개, guardrails/diff/scoped format 검사 통과. typecheck에서 arrow fixture의 branded LocalPoint를 기존 pointFrom helper로 수정했다. 기존 Node MODULE_TYPELESS/DEP0169, MetaProperty lint 진단·테스트 Firebase config/font/chunk/Browserslist 경고는 유지한다. 전체 upstream suite/운영 DB·두 계정·게스트/모바일·다른 기기·Cloud 저장/실제 장애 주입은 범위 밖으로 생략했다.
- Safari 실제 확인: 기존 합성 로컬 아키텍처의 3개 문구를 선택하고 `qwen3.5:9b`로 괄호 속 영문 제거·축약을 요청했다. `클라이언트 (Browser)→브라우저`, `웹 서버 (Web Server)→서버`, `데이터베이스 (DB)→DB` 전후 표를 확인하고 적용했다. 도형/arrow와 선택 밖 로그인 흐름은 보존됐으며 한 번 undo로 원문 전체 복구 후 redo로 재적용했다. 스크린샷 `/tmp/personal-excalidraw-ai-label-preview.png`, `/tmp/personal-excalidraw-ai-label-applied.png`는 임시 로컬 증거이며 Git에는 넣지 않는다. 이번에는 backup 다운로드/재가져오기를 다시 실행하지 않았고 기존 생성 MVP 및 실제 IndexedDB 자동 검사 결과와 구분한다.
- 한계: 첫 수정 범위는 문구뿐이다. 구조 재작성/새 도형/삭제·이동/대화 이력과 수정 이미지 미리보기는 미구현이다. 전후 표로 의미를 검토해야 하고 번역/축약 정확성을 보장하지 않는다. 공간에 맞추기 위해 font를 줄일 수 있고 최소 크기에서 들어가지 않으면 전체 적용을 거부한다. 직접 arrow 끝점이 붙은 standalone text, 잠긴/깨진 binding/비정상 치수 등은 지원하지 않는다. 백업은 생성 모드와 같은 계정/문서별 마지막 한 개를 공유하며 로컬 보존·eviction/로그아웃/원격 복구 한계는 D-033과 같다. 운영 배포는 하지 않았고 모델 11434/bridge 3004/개발 앱 3006은 체험을 위해 실행 상태로 둔다.

## 2026-10-17 무료 로컬 AI 다이어그램 MVP

- 우선순위: 사용자 요청으로 Milestone 8 운영 점검/배포를 보류하고 Milestone 9/10 로컬 AI 생성부터 구현했다(D-033). 기능 브랜치 `codex/local-ai-diagrams`. 신규 app `ai/schema/client/editor`, `components/cloud/AIDiagram`과 메뉴/App 연결, loopback bridge/HTTP 검사, README/ROADMAP/DECISIONS/ai-gateway/operations/본 기록이 변경 범위다. core/dependency/DB/relay/운영 endpoint·요금은 바꾸지 않았다.
- 자동 검증: 앱 범위 36파일/331개(신규 AI 18개 포함) 통과. strict DSL 필드·shape·중복/없는 참조·개수·제어문자·Mermaid escape, 실제 Excalidraw의 기존 element 보존/오른쪽 추가/한 번 undo, backup 실패와 비동기 backup 중 문서 변경/scene 변경/read-only 적용 거부, 실제 IndexedDB 이미지 bytes 포함 `.excalidraw` 복원·다른 key 격리, Strict Mode 단일 연결·명시적 Apply 전 무변경·취소 후 늦은 응답 무시·문서 generation 변경 검사를 포함한다. UI 검사는 Dialog/provider와 preview builder를 mock하며 실제 모델 품질을 대신하지 않는다.
- 실제 loopback HTTP 하네스 6개 통과: Host/Origin/token 거부, 설치된 local completion 모델만 허용(embedding/명시적 cloud 제외), 고정 upstream URL/프롬프트만 전달/도구 미전달, 모델 override/추가 operation/큰 body 거부, 잘못된 provider output 원문 비노출, single-flight/분당 요청 예산, 브라우저 취소의 upstream AbortSignal 전달. 모델 서버 응답은 합성 mock이며 실제 추론은 아래 Safari 검사와 구분한다.
- 타입/전체 strict lint/guardrails/diff 검사 통과. 전체 upstream core suite, 운영 DB/두 계정·게스트/실제 모바일·다른 기기 AI/브라우저 강제 종료 내구성은 이번 범위에서 생략했다. Node MODULE_TYPELESS/DEP0169, 기존 MetaProperty lint 진단·테스트 Firebase config 경고는 유지하며 secret 원문을 새로 출력하지 않는다. 최초 테스트의 obsolete API prop/keyboard 옵션·unreferenced file fixture와 Blob URL 환경 mock을 수정한 뒤 재실행했다.
- Safari: 비로그인 새 origin `http://127.0.0.1:3006/`에서 설치된 `qwen3.5:9b`로 실제 로그인 흐름 생성→미리보기→캔버스 추가→한 번 undo→redo, 창 재열기의 마지막 backup 다운로드 버튼 표시를 확인했다. 5노드 요청에 4노드가 나오는 의미/개수 정확성 한계가 있었다. 두 번째 LR 아키텍처 생성에서 SVG 미리보기 한글 일부 누락을 관찰해 PNG raster export(최대 변 1600px)로 바꿨다. textarea 줄바꿈의 upstream selector 우선순위와 적용 직후 확대도 보완했다. 합성 로컬 그림만 사용했고 Cloud 쓰기/원본 삭제/운영 변경은 없다.
- 보존/남은 위험: 입력 prompt만 모델에 보내지만 그 내용은 모델이 받는다. 사용자가 의미/배치를 미리보기로 검토해야 한다. 문서별 마지막 적용 전 백업은 파일 포함 최대 32 MiB의 origin별 IndexedDB이며 암호화/로그아웃 자동 삭제/원격 복구가 아니다. 저장소 삭제/eviction, Mac 메모리·추론 지연, 브라우저 네트워크 정책/설치 모델 차이, 렌더링 폰트 차이는 남는다. 기존 도형 AI 수정·대화·Cloud provider/운영 HTTPS·iPad 연결은 미구현이다. 노트북 모델/bridge/개발 앱 실행 절차는 operations를 따른다.
- 최종 Safari 확인: PNG 미리보기에서 한글 라벨 전체 표시와 입력 줄바꿈, 기존 로그인 그림 보존/오른쪽 아키텍처 추가/100% 화면 맞춤을 확인했다. 실제 `Downloads/before-ai.excalidraw` 다운로드는 적용 전 로그인 흐름 13개 element/6개 text를 포함하고 새 아키텍처는 포함하지 않았다. 이미지 bytes 복원은 자동 검사로 확인했으며 이번 Safari 다운로드는 이미지가 없는 합성 그림이다. 다운로드 백업을 Safari로 재가져오기는 생략했다. 화면 캡처는 `/tmp/personal-excalidraw-ai-preview-final.png`, `/tmp/personal-excalidraw-ai-applied.png`에 보관했다(임시 파일이며 Git에 넣지 않음).
- 최종 build/PWA precache(62개)도 통과했다. 기존 font/chunk/Browserslist/Node 경고는 유지한다. 앱 전체가 아니라 `excalidraw-app` 범위 331개를 실행했으므로 upstream 전체 suite 통과로 표시하지 않는다. 로컬 모델 11434/bridge 3004/개발 앱 3006은 직접 체험할 수 있도록 실행 상태로 남겼다. 추가 모델 다운로드/유료 API/운영 배포는 없다.

## 2026-10-17 relay 연결·전송·대기열/코드 로그

- 변경: 별도 room repo의 `src/limits.ts` Budget/Capacity, `src/index.ts`의 handshake lease·Engine input/queue·namespace event·room/recipient 예산·timeout과 로그 억제, PERSONAL 문서. 앱은 신규 `check-room-limits.node-test.mjs`, 기존 admission 하네스의 signed 정원 검사, README/ROADMAP/DECISIONS(D-032)/collaboration/operations/검증 문서만 변경했다. 앱 runtime/core/dependency/lockfile/DB/Edge/엔드포인트·운영 설정·요금은 그대로다.
- relay 결과는 `codex/collab-relay-limits`의 `5fa5e6c`에 커밋했다. 앱 하네스/문서는 같은 이름의 별도 기능 브랜치다. 운영 브랜치 merge/Render 배포는 하지 않는다.
- resource 하네스 8개 통과: fake clock의 예산 경계·회복·잘못된 cost·fanout 및 capacity 이중 반환 안전성; 80개 동시 handshake 중 64개만 허용; 64개 연결 후 추가 거부/해제 재사용; 실제 raw polling reader를 멈춰 queue 상한에 따른 제거/정상 peer 재전송 유지; 실제 30초 미입장 timeout/입장 idle peer 유지; room 8명과 recipient-weighted 2 MiB 전달 예산 초과 시 미전달/송신자 종료; oversized·event spam·미완성 binary attachment flood 종료/신규 정상 peer 재전송; DEBUG=*와 잘못된 Origin 설정에서 합성 socket/room/payload/config marker 비출력. 전체 RSS/OS buffer/공개 부하·분산 제한을 측정한 것은 아니다.
- 기존 admission/relay 하네스는 13개(새 signed 정원/reader 포함·초과 ACK false·퇴장 슬롯 재사용 추가) 통과, 내부 legacy 하네스 7개도 새 서버 바이너리에서 통과했다. 기존 write 양방향/read 수신·송신 제한/서명 위조/만료/갱신/read downgrade/재연결/프론트 session worker·Origin/legacy AES bytes 동작을 유지했다. ticket contract byte parity도 그대로 통과했다.
- relay build(typecheck)/전체 strict lint와 변경 코드 format/diff 통과. 앱 harness scoped lint/format/diff/guardrails 통과. 최초 relay typecheck의 Engine packet implicit-any는 unknown data 경계 타입으로 보완했다. 앱 전체 suite/typecheck/build, DB 하네스와 Safari/두 실제 브라우저/모바일·Render cold start·컨테이너/공개 부하 검사는 앱 runtime/schema/UI 무변경으로 생략했다. Node MODULE_TYPELESS 경고는 기존과 같으며 repo metadata를 바꾸지 않았다.
- 코드 로그 점검: relay protocol debug를 환경 DEBUG=*에서도 비활성화하고 동적 식별자/원문 exception 로그를 제거했다. Edge quota/ticket/file 코드에는 원문 console 로그가 없음을 확인했다. provider access/request-body/SQL parameter·Edge exception 로그 정책은 미조회/미검증이며 코드 점검을 운영 확인으로 대체하지 않는다. fixed health/일반 startup error 외 상세 진단이 줄어드는 한계가 있다.
- 모든 합성 relay/연결은 하네스가 finally에서 정리했다. 기존 사용자 3002 서버/브라우저/실제 그림·로그인/DB·서명 키/Render/Vercel/무료 설정은 변경하지 않았다. 상한은 process 재시작 시 초기화되고 protocol overhead/transport in-flight·월 사용량·요금 전체를 보장하지 않는다. 강제 종료 후 자동 재접속/미저장 collaborative local draft/최종 flush 한계도 남는다. 다음은 provider 로그/키·환경/Storage 호환 사전 점검 후 hosted 순차 배포·두 계정/게스트 검증이다.

## 2026-10-17 DB 공유 quota

- 변경: quota/ledger/RLS·서비스 전용 RPC·Storage/scene/metadata trigger migration, shared projectQuota RPC helper, files/ticket handler와 entrypoint, 4개 기존 fixture 및 신규 mock HTTP test, 일회용 DB bootstrap/하네스/SQL 검사, 계획·운영 문서. core/dependency/일반 개인 Cloud/relay/운영 설정·요금은 변경하지 않았다. 운영 flag off 유지.
- 신규 mock HTTP 11개 통과: DB 예산 거부 429/Retry-After/body 미사용·권한/Storage/sign 미호출, transport/잘못된 응답 fail-closed·진단 비노출, 예약 거부 507, 업로드 응답 유실 후 같은 경로 재시도, read/잘못된 bytes는 예약하지 않음, RPC 인자 allowlist/redirect 금지. 기존 persistence 203개도 통과했다.
- 일회용 실제 PostgreSQL: 기존 private Storage 정책 11개(로컬 stub), 기존 role/access/CAS 28개를 migration 전/후 각각 통과. 신규 quota SQL 33항목은 RLS/직접 GRANT·서비스 전용 함수 격리, wrong proof/read 거부, 동일 경로 재시도·quota 가득 참·Storage 미예약 insert/rename, scene bytes delta/한도 초과 시 원본 보존, room/invite 상한, 분 예산 거부/회복 및 cascade 후 파일 예약 보존을 확인했다. SQL 실패는 예상 SQLSTATE까지 비교한다.
- 별도 실제 DB 연결 2개가 마지막 파일 슬롯(실제 63개 예약 후 경쟁)·마지막 요청 token을 두고 경쟁하면 한 개만 성공했다. 기존 CAS도 한 revision만 저장. 기존 파일이 있는 별도 DB에서 migration이 실패하고 quota table 미생성/원래 객체 유지도 확인했다. 임시 container/DB는 finally에서 정리했다. Docker가 꺼져 있어 최초 실행은 실패했고 `docker desktop start`로 시작한 뒤 재실행 통과했다. 운영 DB 접속은 없다.
- 전체 앱 suite: 151파일/2,166 passed/47 skipped/1 todo. 전체 lint/앱 typecheck, Docker network-none Deno 두 entrypoint 검사, build/PWA precache 통과. guardrails에서 새 private table에 client policy가 없다는 경고는 의도된 default-deny 구조이며 RLS/GRANT 역할 검사로 확인했다. 기존 Node/MetaProperty/font/chunk/Browserslist 경고 유지. 코드 format/diff도 확인한다.
- 미검증/위험: UI/scene 포맷 무변경으로 Safari/운영 로그인·두 계정·게스트·모바일 검사는 생략. hosted Storage 실제 POST/overwrite/metadata 생성 순서·trigger 호환성, provider log/body 정책과 배포·old/new Edge 전환은 미확인이다. 예약은 보수적으로 남으며 자동 환급하지 않는다. DB rollback된 거부 시도는 rate counter도 rollback된다. 협업 payload·예약 상한이지 DB 물리 크기·월 대역폭·요금/모든 공격 차단 보장은 아니다. 다음은 relay 연결/송신 총량과 로그 정책, 이후 hosted 순차 적용/검증이다.

## 2026-10-14 자원 제한 첫 단위

- 변경: Supabase file loader/test의 압축 해제 상한, core `data/encode.ts`의 optional maxDecompressedBytes API(D-030 명시 예외), Edge shared requestBudget와 files/ticket handler, resourceLimits test, README/ROADMAP/DECISIONS/operations/검증 문서. core의 다른 파일/암호화 형식/dependency/schema/relay/운영 env/요금은 변경하지 않았다. 기존 기본 codec/Firebase 및 flag off 유지.
- 신규 resourceLimits 16개, file loader 추가 1개 통과. 실제 AES-GCM/pako 2.0.3 정상/기본 복원 일치, 정확한 출력 경계(래퍼/메타 포함), 8 MiB→작은 암호문 공격의 조기 중단, 실제 gateway/file loader 실패 결과, 비압축 경계/잘린 압축 stream/잘못된 limit/실패 메타 로그 비출력, 요청 창 초기화/Retry-After·이중 release 안전성, 파일 3·ticket 8 동시 상한과 실패 슬롯 반환, malformed 요청 limit/OPTIONS 제외를 확인했다. byte 크기를 검사한 결과이며 브라우저 process RSS/CPU나 이미지 픽셀 디코드 전체 한도를 측정한 것은 아니다.
- 전체 앱 검사 150파일: 2,155 passed / 47 skipped / 1 todo. 전체 code lint, 앱 typecheck, Docker network-none의 Deno 두 entrypoint 타입 검사, build/PWA precache 통과. 변경 코드 format/diff/guardrails는 core 일회용 예외 환경으로 검사한다. 기존 Node/MetaProperty/font/chunk/Browserslist 경고는 유지한다.
- 생략: UI 변경이 없어 Safari 새 로그인/운영 데이터 생성·삭제/두 기기 검사는 하지 않았다. schema/relay 무변경으로 PostgreSQL/Socket 하네스 재실행 생략. 실제 hosted isolate 재시작/다중 인스턴스 요청·공개 부하·Storage 총량/분산 quota·relay 연결/송신 총량·provider 로그 정책은 미확인이다. 이번 카운터는 isolate 단위 backpressure이며 비용/월 사용량 또는 전역 abuse 보장을 하지 않는다. 운영 배포/flag 활성화 전 DB 전역 용량/분산 quota부터 이어서 구현한다.

## 2026-10-14 소유자 방·초대 관리

- 변경: app RoomManagement UI/SCSS/test, cloud 로그인 메뉴와 App mount, owner SDK/test, README/ROADMAP/DECISIONS(D-029)/operations/검증 기록. core/dependency/schema/Edge/relay/운영 설정은 변경하지 않았다. 기본 off flag와 기존 Firebase 유지.
- SDK는 cryptographic room/key/UUID 생성, 깨끗한 초대 URL, owner RPC create/issue/revoke, proof 없는 목록, 소유자 RLS를 통한 지정 proof hash 키 복구를 구현했다. 응답 유실/부분 성공은 같은 draft ID/키/expiry로 재시도하며 일치 메타데이터와 초대 proof를 확인한다. 만료/폐기 링크의 키 복구는 소유자만 가능하며 이전 초대 권한을 되살리지 않는다.
- mock SDK/UI 집중 검사: 새 SDK 12개, UI 11개. read/write·만료 선택·초기 write 초대, owner RLS 실패/disabled/응답 유실, 폐기/만료, 재시도 동일 draft·중복 클릭, key 복구/다른 room/실패, 로그인/flag/계정 전환/닫기 stale 응답을 확인했다. 관련 persistence/선택 UI/기존 협업 회귀를 함께 실행했다. 실제 HTTP/운영 DB 권한 검증을 대체하지 않는다.
- 최종 집중 결과는 16파일/211개 통과. iframe에서는 기존 협업 차단과 동일하게 새 관리 메뉴도 숨긴다. 변경 12파일 guardrails 및 코드 scoped format/diff 검사 통과.
- 타입/전체 lint/build(PWA precache 62 entries) 및 guardrails/diff 검증을 실행했다. 기존 Node/MetaProperty/font/chunk/Browserslist 경고는 유지한다. 전체 앱 suite/DB 역할 하네스/relay 하네스는 이번 작은 owner UI 변경에서 생략했다(기존 서버 계약/정책/transport 무변경). Safari 현재 로컬 탭은 비로그인 상태를 관찰했으며 새 관리 화면의 실제 로그인/실서비스/모바일 시각 검증은 실행하지 않았다. 새 로그인/운영 초대 발급·설정 변경은 없다.
- 남은 위험: create+issue는 별도 RPC로 빈 방이 남을 수 있고 닫기 후 미발급 키를 복구할 수 없다. 목록은 최신 각 100개까지로 pagination/방 삭제 미구현. 폐기된 데이터 회수 불가/relay TTL 지연. hosted 배포·실제 두 계정/게스트·이미지/재연결/공개 rate·총 용량/로그·inflate 메모리 제한 후 flag 활성화를 검토한다. 다음 단위는 공개 운영 제한이다.

## 2026-10-14 선택 화면/controller 통합

- 변경: `App.tsx`의 viewMode prop/onChange 잠금, `Collab.tsx`의 새 startInvitation/provider/epoch/scene queue/rollback·cleanup, Portal의 joinLegacy 및 canWrite 가드, inviteState atom, 선택 UI/test, 실제 편집기 `collabInvitation.test.tsx`, 공개 env 타입, app Vite precache limit 및 계획/운영 문서. core/dependency/lockfile/DB/Edge/relay/운영 설정은 변경하지 않았다. `VITE_COLLAB_SUPABASE_ENABLED`는 기본 off다.
- 집중 검사 232개/21파일 통과. 새 실제 편집기 검사 12개는 ACK 전/늦은 snapshot 원본 유지, 취소 시 개인 drawing 유지, snapshot 오류/Firebase fallback 금지, read-only editor/save/broadcast/종료 경고, 실제 AES-GCM 초기 peer buffer 병합, account change stale 차단, reconnect local/remote 병합 및 provider epoch 무효화, stop 취소·local 복귀, write Supabase 선택/read downgrade, 초기 apply 실패의 scene/binary rollback, queue 64개 상한을 확인했다. 선택 UI 추가 2개는 opt-in 성공 후 chooser 닫기 및 입장 실패 재시도다. backend/Socket/worker callback은 mock이며 실제 편집기와 crypto/restore/reconcile는 사용한다.
- 마지막 follow/idle cleanup 보완 후 집중 26개, 전체 `yarn test:app --watch=false` 147파일/2,115 passed/47 skipped/1 todo 통과. 타입/전체 code lint와 scoped lint/최종 build 통과. 실제 loopback relay admission 하네스 12개 및 nested legacy 7개도 재실행했다. 이 하네스는 relay+session worker이며 전체 App/Supabase HTTP를 두 브라우저에 연결한 검사는 아니다.
- 실제 core resetScene이 read viewMode를 false로 초기화하는 실패를 재현해 prop만으로 충분하지 않음을 확인했다. onReady/onChange에서 잠금을 다시 적용한 뒤 통과했다. mock UI가 app store Provider 없이 렌더돼 chooser가 닫히지 않던 fixture를 실제 App과 같은 Provider로 맞췄다. nullable follow target/MIME fixture 타입 오류도 수정했다. 구버전 서명·시간/순서 검사 및 Cloud autosave/초안/URL 회귀를 함께 실행했다.
- 최초 PWA build는 static main 2.43 MB로 기존 precache 한도를 초과했다. provider/session/request를 lazy import한 뒤 main 약 2,412.20 kB로 낮췄으나 기존 2.3 MiB보다 약 0.5 kB 커서 2.4 MiB로 최소 상향했다. 최종 build는 precache 62 entries 성공이며 생성된 SW의 main/lazy provider/session/request 포함을 확인했다. PWA 비활성화/캐시 제외는 하지 않았고 실제 browser offline 설치 검사는 생략했다. build와 동시 typecheck의 삭제된 임시 Vite config TS6053은 순차 실행으로 해소했다. 기존 Firebase config/MetaProperty/font/chunk/Browserslist/Node/parser 경고는 유지한다.
- Safari: 기존 사용자 탭과 별개인 `127.0.0.1:3005` opt-in 임시 탭/합성 초대에서 로그인·게스트 버튼, guest 확인 중 비활성화, 실패 안내/버튼 재활성화, 닫기 후 query/hash 제거·기본 캔버스 복귀를 확인했다. 화면에서 잘림/겹침은 관찰하지 않았다. 운영 RPC 미적용/합성 초대이므로 실패 원인이나 실제 valid invite 성공을 이 UI 관찰로 확정하지 않는다. 오류 화면을 `/tmp/personal-excalidraw-entry-safari.png`에 기록했고 임시 탭/3005 서버를 종료해 기존 3001 탭으로 돌아왔다. 실제 사용자 scene/key/Cloud 쓰기·삭제/로그인·서버 설정 변경은 없다.
- 생략/남은 위험: hosted Supabase migration/Edge/key/Render/Vercel 활성화, 실제 두 계정/guest HTTP 및 두 브라우저/모바일/Storage·다른 기기·reload·offline·JWT expiry·Render cold start, 새 방 생성/초대 관리 UI. 종료 직전 collaborative save flush 완료, 아직 미다운로드 이미지의 완전한 local 복사/단절 후 collaborative local draft 복구도 보장하지 않는다. 공개 rate/총 용량/inflate 메모리 상한/인프라 로그/키 회전은 적용 전 완료해야 한다. 기존 Firebase URL 및 새 방 기본 off를 유지하며 무료 설정과 운영 데이터는 그대로다. 변경 코드 format/diff/guardrails(16개 파일) 통과 후 기능 브랜치에 커밋한다.

## 2026-10-14 프론트 admission 세션 기반

- 변경: `collab/persistence/relayTicketRequest.ts`/test, `relaySession.ts`/test, 선택한 account/guest client를 반환하도록 기존 admission helper export, 실제 relay 하네스 worker 검사와 README/ROADMAP/DECISIONS/협업 저장/operations/검증 문서. controller/Portal/App/선택 UI/core/dependency/DB/Edge/별도 서버 소스/운영 설정은 변경하지 않았다. runtime provider는 Firebase, 새 방 UI는 잠금 상태다.
- 집중 앱 검사 91개/8파일 통과: 새 request 15/worker 16, 기존 issuer 31/admission 7/선택 화면 10/adapter 7/실제 편집기 협업 2/operation 3. 실제 HKDF·P-256 서명 ticket을 request 검사에 쓰며 Functions invoke/Socket는 mock이다. proof만 전송/key·scope 비전송/unknown 응답·오류 비노출/abort·stale, ACK와 preparation 이전 writable 잠금, read/갱신·scope 변경/visibility single-flight, 늦은 ticket·ACK/재연결/close·외부 generation 변경/timeout/만료를 검사했다. 초기 mock tuple 타입 오류는 명시적인 request signature로 수정 후 타입·빌드·테스트를 재확인했다.
- 같은 relay 하네스에 실제 `relaySession.ts`를 연결했다. 실제 loopback 서버/Socket.IO와 P-256 signer로 입장→암호문 bytes 전송→갱신→write에서 read로 잠금→재연결 새 challenge/입장권 및 수신을 확인했다. Supabase HTTP는 호출하지 않고 synthetic signer request를 주입했다. 처음 ticket은 29초 전에 발급한 유효 ticket으로 만들어 실제 약 1초 뒤 renewal timer를 확인했다. 실제 브라우저 UI/초대 계정 인증·30초 장기 대기 검사로 표기하지 않는다. 최종 하네스 12개 및 nested legacy 7개 통과 후 임시 서버와 연결을 종료했다.
- 타입/전체 code lint/빌드 통과 후 마지막 reconnect 대기 제한과 preparation 취소 검사 추가를 집중 91개/타입/scoped lint/빌드로 재확인했다. 기존 Firebase config/MetaProperty/font·chunk·Browserslist/Node module type 경고는 유지한다. 변경 코드 scoped format/diff/guardrails(변경 12파일) 통과. 로컬 3001 HTTP 200이며 화면 검증을 대체하지 않는다.
- 생략/남은 위험: 전체 앱 테스트, Safari/두 실제 브라우저/모바일/실제 background tab timer clamp·OS clock skew, hosted Edge/JWT·DB/Storage/Render cold start/권한 폐기·배포·키 회전. worker가 parsed claims로 권한을 신뢰하는 것이 아니라 relay ACK 후 canWrite를 여는 계약이며 UI/controller는 아직 이 worker를 사용하지 않는다. 다음은 ACK 후 scene 준비/기존 scene 보존/초기 원격 업데이트 경합/read-only viewMode/provider/계정·route·stop 수명주기 연결이다. 운영 비용·무료 설정/실제 데이터는 변경하지 않았다.

## 2026-10-14 relay socket 입장·갱신 연결

- 변경: 별도 relay `src/index.ts`, 새 `src/admission.ts`/byte-identical `src/ticket.ts`, Node 24에 맞춘 ES2020/CommonJS tsconfig와 PERSONAL 가이드. 앱 저장소는 `check-room-admission.node-test.mjs`와 계획/운영/검증 문서만 변경했다. app controller/provider/core/dependency/lockfile/DB/Edge 함수/운영 키·Render/Vercel/무료 설정은 그대로다.
- 서버 build/typecheck와 전체 server code lint, 변경 서버 코드 scoped formatting 통과. 앱 issuer/handler 31개도 재실행 통과. 새 실제 Socket.IO 하네스 11개와 같은 새 서버 바이너리의 기존 relay 하네스 7개 통과. signer/verifier 소스 byte parity를 확인했다. loopback 임시 포트만 사용하고 메모리에서 생성한 합성 키로 검사했으며 임시 서버/연결은 종료했다. 기존 3002 서버는 건드리지 않았다.
- write 양방향 bytes 보존/read 수신, read reliable/volatile/follow 거부, write follow, 위조·만료·다른 Origin/socket/room/extra 입력·미참여 전송·legacy join 우회 거부, 다른 canvas/follow 격리, 동시 join 단일 방, 갱신/오래된 갱신 거부/write→read 즉시 다운그레이드, 실제 만료 timer 종료·새 socket challenge 재입장, private JWK import 거부/공개 키 누락 시 새 방 닫기·legacy 유지, 소켓별 검증 10회 제한을 확인했다. 만료 검사는 오래전에 발급된 유효 ticket을 사용해 실제 2~3초 대기했고 clock mock으로 대체하지 않았다. 이전 legacy 하네스는 실제 AES-GCM 전달/재접속/Origin·polling 검사도 포함한다.
- 초기 ES2020 target 변경에서 module 기본값이 달라져 서버가 시작되지 않은 것을 CommonJS 명시로 수정해 실제 시작을 재확인했다. 하네스의 nested node test가 부모 NODE_TEST_CONTEXT를 상속하면 exit 0만으로 실제 실행을 확인할 수 없음을 발견해 해당 env를 제거하고 TAP tests/pass 7을 assert한 뒤 최종 재실행했다. Node의 .ts module type warning은 유지하며 root package type이나 dependency를 바꾸지 않았다. 가드레일(8개 변경 파일)/diff/scoped harness lint·format 통과. 서버 `d13e0c5`를 기능 브랜치에 커밋/push했으며 운영 Render Source는 변경하지 않았다.
- 생략/한계: app 코드 변경이 없어 앱 전체 type/lint/build/full suite는 반복하지 않고 변경 Node 하네스 lint와 issuer 집중 검사를 실행했다. 공개/컨테이너/브라우저 두 계정·UI, 실제 Supabase 발급/DB·Edge·relay 배포, 네트워크 재시도/갱신 실패 UX는 미검증이다. read-only UI/provider 입장·계정 수명주기와 renewal timer는 다음 프론트 단위다. 전역/IP 연결 제한·전송량/메모리/공개 부하·로그·키 회전은 별도이며 per-socket verification 제한만으로 해결됐다고 판단하지 않는다. 현재 recipient lookup은 단일 프로세스 in-memory adapter 전제다. 이미 받은 bytes는 회수할 수 없고 초대 폐기 반영은 최대 60초 지연될 수 있다. 운영 변경/유료 옵션/새 방 UI 활성화는 하지 않았다.

## 2026-10-14 relay 입장권 기반

- 변경: `supabase/functions/collab-ticket/{ticket,handler,index}.ts`, 미배포 function config, `collab/persistence/relayTicket.test.ts`와 README/ROADMAP/DECISIONS/협업 저장/operations/검증 문서. core/dependency/DB/기존 controller/provider/별도 relay 저장소/운영 서비스·키 설정은 변경하지 않았다. 새 방 gate를 유지한다.
- 집중 검사 67개/4파일 통과: 새 입장권 31개 + admission 7/통합 adapter 7/파일 gateway 22. 테스트에서 매번 생성한 P-256 키와 실제 Web Crypto sign/verify 및 Web Request/Response를 사용한다. backend 권한은 mock이고 실제 Supabase HTTP 인증 검사는 아니다. read/write 보존, proof/key 비포함, 60초 경계 만료·미래 발급, 다른 room/Origin/challenge/key, payload 변조 및 올바른 서명의 잘못된 issuer/audience/version/scope/TTL/추가 claim, 잘못된 입력/권한·요청 크기/읽기 timeout/Origin·method·content-type/preflight/오류 비노출을 확인했다.
- 공식 Deno 이미지(network none, 저장소 readonly, host port 없음)에서 실제 Edge index check 통과. Entry RPC/fetch와 env 오류 경로는 타입 검사이며 실제 서버 실행/배포 검사는 아니다. 앱 타입·전체 lint·빌드와 변경 코드 scoped formatting 통과. 초기 테스트 HeadersInit 타입 오류는 fixture를 명시적인 문자열 map으로 고쳐 타입/빌드 및 입장권 31개를 재실행했다. 기존 Firebase config/MetaProperty/font/chunk/Browserslist/Node 경고는 유지한다. guardrails/diff 검사도 통과했다.
- 생략/남은 위험: 전체 앱 테스트, 실제 Edge↔Supabase RPC, relay 적용/socket challenge 발급·재연결·갱신/읽기 전용 전달 권한, 브라우저 UI 및 두 실제 클라이언트, 운영 배포/secret 등록. 이미 발급된 ticket은 최대 60초 폐기 반영 지연이 있으며 즉시 퇴장을 보장하지 않는다. rate/총 용량/인프라 로그 제한과 키 회전·갱신 실패 정책은 활성화 전 후속이다. 무료 설정은 변경하지 않았다.

## 2026-10-14 통합 Supabase adapter와 방 전환 경계

- 변경: `collab/persistence/supabase.ts`와 테스트, scene decoder export, 기존 파일 prefix 호환 검사, `Collab.tsx`/`Portal.tsx` 및 공유 `data/FileManager.ts`의 generation 방어와 관련 테스트, README/ROADMAP/DECISIONS/협업 저장 설계/operations/검증 문서. core/dependency/DB schema/Edge 함수/relay/운영 설정은 변경하지 않았다. 기본 provider는 Firebase이고 새 방 실제 입장은 여전히 비활성화다.
- 집중 앱 검사 160개/18개 파일 통과. 실제 upstream 암호화·복원 codec과 편집기를 사용하며 Supabase RPC/Functions 및 Firebase backend는 mock이다. 통합 adapter 7개, 파일 prefix 호환 추가 1개, controller 이전 저장 결과/오류 무시·종료 취소 3개, Portal 느린 암호화 이후 다른 socket 전송 차단 2개, FileManager reset 후 동일 ID 새 fetch/save marker 보존 2개를 포함한다. 공유 helper 변경에 따른 기존 Cloud autosave/초안/내보내기 회귀 27개도 포함했다. 기존 충돌/offline/파일 부분 실패 검사를 함께 실행했다.
- 최종 타입 검사와 빌드 통과. 테스트 fixture의 branded 요소/WS_SUBTYPES enum 타입 오류를 수정해 다시 검사했고 controller/Portal 5개를 재실행했다. 전체 code lint, guardrails(변경 파일 17개), diff 및 변경 코드 scoped formatting 통과. 로컬 앱 HTTP 200을 확인했으며 화면 검증을 대체하지 않는다. 기존 Firebase config undefined/MetaProperty/폰트·chunk·Browserslist/Node 경고는 유지한다.
- 생략: 전체 앱 테스트, DB/Edge/relay 재검사(이번 변경 없음), Safari 화면 및 두 실제 클라이언트 편집·재연결, hosted Supabase/JWT/Storage/새로고침·다른 기기 복원. 이 단위는 UI/실제 입장/provider 선택을 연결하지 않았으므로 backend mock 검사를 운영 활성화 검사로 표기하지 않는다.
- 남은 위험: 이미 서버에 전달된 write는 취소되지 않을 수 있다. 계정 변경/입장/provider 수명주기, relay ticket 발급·검증, 읽기 전용 편집 UI/broadcast/종료 경고 처리가 다음 연결 단계다. 압축 해제 메모리 상한, rate/총 용량, 인프라 header/body 로그 점검도 공개 활성화 전에 완료해야 한다. 운영 DB migration/Edge 배포/Render/Vercel 재배포나 유료 옵션 추가는 하지 않았다.

## 2026-10-14 private 협업 파일 기반

- 변경: private collab-files bucket migration, 미배포 Edge config/handler/index, Supabase 파일 client/test, gateway test, 로컬 Storage schema/policy 검사와 기존 DB 하네스 확장, 정확한 server env lookup만 허용하는 guardrail 및 fixture 검사, 관련 docs. core/package/dependency/기존 provider/운영 env/DB/Storage/relay/배포는 변경하지 않았다. 실제 관리자 secret은 조회·저장·출력하지 않았다.
- 집중 앱 테스트 118개 통과: 기존 87 + gateway 22/client 9. Web Request/Response와 실제 HKDF/upstream 압축·AES codec 사용, Storage backend와 Functions invoke는 in-memory 연결이다. 원본 file ID/data URL/metadata 복원, 새 client instance 복원, dedupe/부분 실패/재시도/허용되지 않은 prefix·key·ID·크기·body·Origin/읽기 전용 쓰기 차단, unknown 성공·통신 오류, 다른 file ID로 옮긴 암호문/늦은 room generation 결과 차단을 검사했다. 합성 TEST data URL은 codec 검사용이고 실제 PNG 렌더링 검사는 아니다.
- 일회용 PostgreSQL storage schema stub에 bucket migration 적용, private/4 MiB/MIME 확인 및 anon/authenticated SELECT·INSERT·UPDATE·DELETE 차단, 일부러 broad permissive policy를 추가해도 restrictive policy 차단, 다른 bucket 기존 policy 유지/원본 fixture 보존까지 11항목과 rollback 확인. 기존 scene/RLS 28항목·rollback·두 실제 DB 연결 CAS 경쟁도 재실행했다. 실제 Supabase Storage API/JWT 검사로 표기하지 않는다.
- 타입/전체 린트/빌드, server source/DB 하네스 scoped lint, Node guardrail fixture 4개 통과. 공식 Deno Docker image의 Deno 2.9.7/TypeScript 6.0.3으로 Edge index check 통과(컨테이너 network 없음). 초기 부분 실패 mock이 async crypto 완료 순서에 의존해 실패한 것을 특정 file ID에만 장애를 주도록 고쳤다. 도구의 초기 Docker 명령은 deno 실행 파일이 빠져 실패해 수정 후 재확인했다.
- 기존 Firebase config 미설정/MetaProperty/font/chunk/Browserslist/Node 및 guardrail 스크립트의 기존 console warning 유지. new file 모듈은 기본 provider에 미연결이라 build는 실제 Storage 기능 활성화 검사가 아니다. guardrails/diff/새 파일 formatting 확인 후 기능 브랜치에 커밋한다.
- 생략/남은 위험: 전체 앱 테스트/실제 Edge↔Supabase REST/두 계정·guest HTTP/실제 이미지 업로드 실패·reload·다른 기기/Storage SDK 및 backend timeout 장애/실시간 ticket/전체 adapter. 이미 허용된 Storage 작업과 폐기 사이의 경합은 원자적이지 않다. upstream inflate 중 메모리 상한, rate/총 용량/header·body 로그 점검도 공개 활성화 전 남아 있다. secret 배포나 function verify 설정의 운영 변경은 수행하지 않았다.

## 2026-10-14 Safari 입장 화면 후속 확인

- Mac 잠금 해제 후 Safari의 새 임시 탭에서 localhost 합성 초대만 사용했다. 로컬 서버가 종료돼 최초 접속 실패를 확인하고 127.0.0.1:3001 Vite를 다시 실행했다. 기존 사용자 탭/그림/DB/운영 배포 설정은 수정하지 않았다.
- 실제 desktop 화면에서 '로그인 계정으로 참여'/'게스트로 참여'/'닫기'가 잘림·겹침 없이 표시됐다. 기존 로그인 표시를 확인한 것이며 새 Google OAuth를 실행하거나 로그인 권한 성공을 검사한 것은 아니다.
- 게스트 선택 시 '확인 중...' 및 두 선택 버튼 비활성화, 이후 '초대를 확인하지 못했습니다. 연결 상태와 서버 설정을 확인하세요.'와 버튼 재활성화를 확인했다. 오류의 HTTP 상태/원인 자체는 이 UI 관찰로 확정하지 않는다. 운영 협업 RPC 미적용 및 합성 초대이므로 유효한 초대 성공/실제 방 입장 검사로 표기하지 않는다. 쓰기/초대 발급/권한 변경은 하지 않았다.
- 닫기 후 초대 query/hash 제거와 기본 캔버스 복귀를 확인했다. 검사 탭은 닫고 기존 탭으로 돌아왔다. 캔버스는 빈 상태여서 비어 있지 않은 scene 보존을 실기기로 검증한 결과는 아니며 해당 보존은 앞선 실제 편집기 자동 검사 결과다.
- 선택 화면과 오류 화면을 로컬 임시 PNG로 보관했다. 실제 사용자 key/proof/scene을 사용하지 않았다. mobile 폭/실제 OAuth/유효 초대 성공/Storage/relay 검사는 남아 있다. 이번 변경은 이 검증 문서뿐이며 guardrails/diff 검사 후 기록을 커밋한다. 코드 변경이 없어 타입/린트/빌드를 반복하지 않는다.

## 2026-10-14 로그인/게스트 선택과 OAuth 복귀

- 변경: CollabEntry TSX/SCSS/test, admission/entryRoute helpers/test, 실제 App 회귀 검사, App/Collab/Dashboard route 가드 및 invite namespace 입력 검사, 개인 계획/운영 문서. core/dependency/DB migration/실제 DB/relay/운영 env/배포는 변경하지 않았다.
- 집중 검사 87개 통과: 기존 persistence 48, entryRoute 18, admission 7, 선택 화면 10, 실제 App 2, 기존 협업 2. single-flight, Strict Mode에서 클릭 전 무요청, guest/account client 분리, proof만 RPC 전송, 서버 권한/unknown scope 오류 비노출, OAuth origin만 전달/실패 시 복귀 제거, TTL·same-origin/path·일회용 복귀/다른 scene 보호, 실패 후 재시도, 닫기·계정 변경의 늦은 응답 차단, malformed/대소문자 marker 거부를 확인했다.
- 실제 편집기 초기 새 route의 협업 flag false/소켓 무접속 및 Collab API 직접 시작 거부, canvas element 유지한 채 초대 열기/닫기 확인. RPC/Auth는 mock이며 운영 Auth/PostgREST 검사로 표기하지 않는다. 초대 검증 성공은 실제 room join을 실행하지 않는다.
- 타입/전체 린트/빌드 통과 후 namespace/popstate 범위 보완을 집중 테스트/타입/scoped lint/빌드로 재확인했다. 가드레일/diff/변경 파일 format 통과. 로컬 127.0.0.1:3001 개발 서버 기동/HTTP 200을 확인했으며 화면 검증을 대체하지 않는다. 기존 Firebase config 미설정, MetaProperty, font/chunk/Browserslist/Node 경고 유지. 초기 env 타입 경고는 getClient에서 URL/key 존재를 확인해 수정했다.
- 생략/남은 위험: 전체 앱 테스트, Safari/desktop·mobile 실화면 확인(Mac 잠금), 실제 Google OAuth 취소·새로고침/Storage 제한, 실제 hosted DB/게스트 HTTP, ticket/relay와 Storage/전체 adapter. sessionStorage는 같은 탭/같은 origin만 지원하고 이미 받은 key나 bytes를 회수하지 못한다. 새 방 생성/실시간 접속은 계속 비활성화하며 운영 migration 미적용 상태를 유지한다.

## 2026-10-13 초대 검증 RPC 및 scene 저장 서버

- 변경: collaboration scene migration, `supabaseSceneStore.ts`/test, 로컬 DB bootstrap/rollback SQL/실행 하네스 및 계획/결정/실행 문서. core/dependency/기존 Firebase/운영 env/실제 Supabase/relay는 변경하지 않았다.
- 일회용 PostgreSQL 16 (Docker, 외부 network/host port 없음)에 migration 적용 성공. owner와 다른 계정/anon DB 역할에서 권한 28항목 통과: 테이블 직접 접근/내부 함수/임의 생성 차단, owner 관리/다른 계정 RLS, 로그인만으로 권한 획득 금지, valid guest/다른 계정 초대 접근, read scope, 다른 방/missing proof/만료/폐기/비활성 방, 초기/중복/오래된 CAS 및 invalid revision/IV/과대 ciphertext. 전체 rollback 후 room/scene/user 0행 확인. 독립 DB 연결 두 개의 실제 동시 최초 CAS에서 saved/conflict 각각 1개 및 revision 1 확인. 컨테이너 제거로 fixture 정리.
- 집중 앱 테스트 50개 통과 (새 RPC store 15 + 이전 35). 실제 HKDF proof, base64 byte 보존, NULL 초기 revision/충돌 응답, malformed scene/잘못된 성공 revision/다른 방/크기 제한/권한 오류/transport rejection 세부 메시지 비노출 검사. RPC 자체는 mock이며 DB 하네스와 구분한다.
- typecheck/전체 lint/build 통과. 기존 Firebase config undefined/MetaProperty/폰트·chunk·Browserslist/Node 경고는 유지한다. 새 모듈은 runtime에 미연결이므로 빌드는 활성화된 Supabase 입장 검사가 아니다.
- scoped source/하네스 lint, formatting, guardrails/diff 검사 통과. 하네스 반복 실행에서 Docker 초기화용 임시 socket 서버를 ready로 오인하는 경합을 발견해 container 내부 TCP ready 검사로 수정하고 재실행했다. 운영 코드 오류가 아니며 host port는 열지 않는다.
- 생략/남은 위험: 전체 앱 테스트, 실제 Supabase Auth/JWT/PostgREST HTTP/두 브라우저, DB 적용, Storage, ticket 서명/relay 검증, 로그인·게스트 선택 화면, 권한 폐기 중 이미 실행 중인 요청의 실제 HTTP 경합, rate limit/총 용량/인프라 body 로그 검토. local auth.uid stub/DB 역할 검사를 실제 로그인 인증으로 표기하지 않는다. 이번 단위는 운영 기능 활성화가 아니다.

## 2026-10-13 초대 proof 및 암호화 CAS 기반

- 변경: `collab/persistence/invites.ts`/test, `sceneWriter.ts`/test와 관련 docs. 기존 Firebase adapter/controller, packages, 운영 env/DB/Storage/relay는 변경하지 않았다. 새 코드의 운영 입장 경로는 아직 연결하지 않는다.
- 사용자 선택은 로그인/게스트 모두 지원(D-020). 새 sc_ room의 invite UUID/provider는 query, key는 기존 room hash에 유지한다. Web Crypto HKDF proof는 room/invite/key에 종속되고 SHA-256 hash 저장 계약이다. 실제 backend expiry/revoke/scope 검증은 미구현이다.
- 집중 검사 35개: invite route/proof 14, CAS worker 11, 기존 adapter 8/협업 2. Node Web Crypto의 실제 HKDF/AES-GCM과 upstream restore/reconcile를 사용한다. synthetic scene/key만 사용했고 실제 사용자 데이터는 없다.
- CAS store는 in-memory atomic mock이다. 두 독립 writer race/재조회 병합, room별 single-flight와 다른 room 진행, 삭제 요소 보존, 3회 충돌 후 중단, stale read/write 결과, offline 후 queue 복구, 다른 key/malformed ciphertext/잘못된 revision 거부를 검사했다. Supabase 원자성/RLS/실서비스 검증을 대체하지 않는다. 테스트에서는 upstream updated timestamp가 1로 고정돼 Date.now도 맞춰 삭제 유예 조건을 검사했다.
- 검증: typecheck/전체 code lint/build 통과 후 추가 입력/응답 검사를 포함한 최종 집중 test/typecheck/scoped lint 재확인. guardrails/diff/scoped formatting 검사. 기존 Firebase config 미설정 테스트 경고/MetaProperty lint 진단 및 font/chunk/Browserslist 경고는 유지한다.
- 생략: 전체 앱 테스트/실기기 입장 화면/서버 만료·폐기/DB RLS/Storage/relay ticket/sleep. 입력 해석은 권한 검증이 아니고 로그인/게스트 선택값도 권한으로 신뢰하지 않는다. 이미 전송된 서버 write는 취소되지 않을 수 있지만 stale 결과를 editor에 적용하지 않는다. 기능 전환/유료 옵션/DB 변경은 하지 않았다.

## 2026-10-13 Milestone 8 Firebase adapter 첫 단위

- 변경 파일: `excalidraw-app/collab/Collab.tsx`의 다섯 persistence 호출, `collab/persistence/types.ts`, `firebase.ts`, `index.ts`, `firebase.test.ts`, 관련 개인 문서. `data/firebase.ts`/core/DB/dependency/env/운영 배포는 변경하지 않았다.
- 기존 함수 reference를 그대로 adapter에 연결해 transaction reconcile/scene version cache/암호화/파일 bytes/에러 반환을 유지했다. 공개 Collab API와 기존 ShareDialog Firebase 사용은 유지한다. Supabase 전환은 아니다.
- adapter 8개: 기본 Firebase 선택/동일 함수, 동기 저장 상태, scene 인자·동일 Promise, 없는 scene/nullable socket, file bytes·부분 실패, 로드 결과·error map, scene/file 오류 전파. 기존 실제 편집기 협업 회귀 2개도 통과했다.
- 최종 검증: `yarn test:typecheck`, `yarn test:code`, 집중 `yarn test:app --watch=false` 10개, `yarn build` 성공. 가드레일 및 diff check 통과. 초기 테스트 fixture 타입 누락/새 파일 import-order는 수정 후 재검증했다. 기존 MetaProperty lint 진단/폰트·chunk·Browserslist 빌드 경고는 유지한다.
- 생략/남은 위험: 전체 앱 테스트/심화 장애 주입/두 실제 브라우저 Firebase 저장은 반복하지 않았다. adapter 검사에서 backend를 mock하므로 Firebase transaction/실서비스/암호화 자체의 새 검증으로 표기하지 않는다. 네트워크 저장 알고리즘은 바뀌지 않았다. Supabase 권한·route·CAS, 느린 응답/offline/충돌/이미지 실패·복원, migration/실기기 검증은 다음 단계다. Milestone 7 운영 화면 접근 차단/실제 sleep 검증도 그대로 남긴다.

## 2026-10-13 운영 협업 endpoint 전환 결과

- 제품 변경 `d86d9e27` Preview 성공 후 personal-cloud에 fast-forward/push. GitHub Production Source 전체 SHA 일치, 운영 version `2026-10-13T12:37:31Z-d86d9e2`, 실제 module bundle에 개인 relay 포함/기존 relay 없음 확인. 별도 Vercel env override는 최종 bundle을 통해 기대값 적용 여부를 판정했다.
- 테스트 Origin 제거 첫 재배포는 입력에 잔여 문자열이 남아 서버 URL 검증으로 종료됐다. 이전 정상 배포가 계속 서비스했다. 편집 값 전체를 정확한 운영 Origin으로 교체하고 Save and deploy 후 Render Live `dep-db72d6nf3r2c73cvibng` 확인. 실제 운영 Origin handshake 성공과 localhost:3003 handshake 거부를 함께 확인했다. 보호 검증을 해제하거나 추가 출처를 남기지 않았다.
- 운영 주소의 자동 브라우저 방문은 저장된 접근 설정으로 거부됐다. 다른 브라우저/간접 실행으로 우회하지 않았다. 이 거부 전에 확인한 version/bundle 결과와, 운영 화면을 실제 확인하지 못한 한계를 구분한다.
- 생략/남은 위험: 운영 두 브라우저 UI/로그인 후 Cloud 기능, 실제 15분 sleep/cold start 복구, 협업 이미지와 모두 퇴장 후 persistence. 관련 로컬 공개 relay 브라우저 확인은 성공했지만 이를 운영 화면 검사로 기록하지 않는다. 기존 Firebase/Cloud autosave 잠금은 유지한다.

## 2026-10-13 공개 서버 앱 연결 검증

- 사용자 승인으로 Render 허용 출처에 정확한 `http://localhost:3003`만 임시 추가/Save and deploy. 별도 개발 앱 실행 환경에서 공개 relay를 지정했으며 기존 개발 env 파일은 변경하지 않았다.
- 기존 Cloud 그림과 분리한 빈 TEST 방에서 Safari/별도 브라우저 양방향 도형/텍스트 전달, 한쪽 새로고침 재참여 뒤 두 요소 복구 확인. 같은 요소 충돌/이미지 협업/모두 퇴장 복원은 검사하지 않았다. room URL/key는 기록하지 않는다.
- 합성 세션 종료 후 임시 출처 제거 재배포 실행. 협업 회귀 2개, production build, 가드레일 통과. 로컬 bundle 개인 relay 포함/기존 relay 없음 확인.
- root `.env.production` 공개 relay 주소 한 줄 변경(D-018 운영 전환 기록). core/dependency/Firebase/Supabase는 변경하지 않았다. 전체 테스트/typecheck/lint는 env-only 범위라 반복하지 않았다. 기존 폰트/chunk/Browserslist 빌드 경고는 유지한다.
- 미검증: 실제 15분 무통신 sleep/cold start 뒤 브라우저 복구, 운영 bundle/Source 반영. 일반 새로고침 재참여를 sleep 검증으로 표기하지 않는다.

## 2026-10-13 Render Free 공개 배포 결과

- 사용자 승인으로 Free 서비스 생성. 카드 등록/유료 전환 없음. `personal-excalidraw-room.onrender.com`, Docker build/Deploy succeeded/Live, Source `e2defb15e792f7d801efb71dc8410fceeb10e1a9` 확인. Auto-Deploy Off/health `/health` 유지.
- HTTPS `/health` 성공 및 status ok. 두 실제 Node 클라이언트의 TLS Socket.IO/AES-GCM 암호문 전달, reconnect 후 재전달, foreign Origin 거부 통과. 임의 합성 방으로 검사하고 연결을 모두 종료했다. room key/URL/사용자 scene은 기록하지 않는다.
- 월별 계정 한도 750시간/5GB/500분 빌드, 카드 없음과 빌드 추가 지출 한도 $0 확인. 숫자는 확인일 기준이고 workspace에서 공유한다.
- 생략: 공개 서버를 연결한 프론트의 두 브라우저 편집, 15분 실제 sleep 이후 cold start/재연결, 이미지/Firebase persistence. 운영 Vercel 환경변수/코드/DB 변경 없음. 다음은 테스트 프론트 연결 검증 후 운영 연결 전환이다.

## 2026-10-13 서버 커밋/push 및 배포 준비 재개

- 서버 build(typecheck)/lint, 실행 dependency audit 0건, 실제 relay 하네스 7개, app guardrails 7 changed files 재확인. 서버 `e2defb1` 커밋/push 및 원격 전체 SHA 일치 확인.
- Docker daemon은 여전히 연결되지 않아 container build는 생략했다. 앱 제품 코드가 바뀌지 않아 전체 앱 검증과 지난 Safari 편집 검사를 반복하지 않았다.
- 서버 기능 브랜치의 GitHub Actions 실행 목록은 조회 당시 비어 있었다. 로컬 검증을 CI 성공으로 기록하지 않는다. master 전용 upstream Docker publish는 실행하지 않았다.
- 사용자 로그인 후 Safari Render 대시보드 확인. 공개 서비스 생성/운영 endpoint 전환은 아직 하지 않았다.
- Render 입력값: 개인 공개 저장소/서버 기능 브랜치/Docker/Free($0)/Origin 제한/health/Auto-Deploy Off 확인. Hobby/카드 없음/빌드 추가 지출 한도 $0 확인. 생성 직전 공개 접근 승인을 요청했으며 결제는 허용하지 않는다. 앱 기록 `c9506cca`도 push했다.

## 2026-10-09 자체 협업 서버 후속 검증/배포 준비

- 변경: 별도 서버 package.json/yarn.lock의 기존 dependency 업데이트와 실행/개발 분리, 다단계 Dockerfile, Render 설정 초안. 앱 코드/DB/운영 URL은 변경하지 않았다. 앱 문서와 relay 하네스는 이전 로컬 구현 변경을 유지한다.
- Safari와 별도 in-app 브라우저의 합성 TEST 방에서 도형/텍스트 양방향 전달, 각자의 undo/redo가 상대 요소를 보존함을 확인했다. 기존 Cloud 그림은 사용하지 않았다. room 링크/key는 기록하지 않는다.
- 서버 재기동 뒤 두 참여자가 재연결되고 상대 편집이 전달됐다. 직후 Safari의 빈 화면은 상대가 새 도형을 편집한 뒤 기존 요소와 함께 복구됐다. 이를 무편집 즉시 복구 성공이나 서버 데이터 유실로 단정하지 않는다.
- 업데이트 후 실행용 audit: 0건. 전체 개발 graph: 101 advisory paths (low 5/moderate 29/high 66/critical 1). 경로 수는 고유 취약점 수가 아니다. 남은 개발 도구 경고는 runtime 감사와 분리하며 production container에는 설치하지 않는다.
- 서버 frozen install/build(typecheck)/lint, 실제 relay 하네스 7개, 앱 협업 회귀 2개, 가드레일(7 changed files) 통과. Render YAML 파싱/주요 설정 검사 통과. 임시 TEST 브라우저 탭은 닫고 기존 탭은 보존했다.
- 생략: Docker daemon 연결 불가로 실제 image build, 공개 호스팅/운영 전환, 같은 요소 충돌 편집, 전원 종료/모두 퇴장 후 Firebase 복원, 협업 이미지 저장. 앱 제품 코드가 없어 전체 앱 typecheck/lint/build/전체 테스트는 반복하지 않고 관련 검사만 실행한다.
- 다음: 서버 변경 검토/커밋/push, Render 계정/플랜/공개 접근 확인 후 외부 배포. 운영 URL 변경은 공개 health/브라우저 확인 이후 별도 시행한다. 심화 안정화는 보류 유지한다.

## 2026-10-09 자체 협업 서버 로컬 구현

Milestone 7 / D-018. 앱 branch `codex/personal-collaboration-server`, 별도 서버 branch `codex/personal-room-server`. 공식 excalidraw-room 기준 `03ff435860b508d7cd9e005cfc90f7977ae2a593`를 개인 Fork/Clone하고 origin/upstream을 확인했다. 새 서버 Fork는 공개 upstream 코드 기반이며 이번 로컬 수정은 아직 커밋/push하지 않았다. 앱 제품 코드/운영 endpoint/DB/로그인/기존 그림은 변경하지 않았다.

- 서버: `src/index.ts`에 HOST/PORT, health, 정확한 Origin allowlist 및 WebSocket handshake 검사, 현재 앱 형식의 room ID/단일 canvas 방 검증, broadcast membership/binary/IV 검사, 동일 방 follow 제한, graceful shutdown 추가. key/scene plaintext는 서버에서 처리하지 않는다.
- 서버: `package.json`의 로컬 실행 명령, Node 24/frozen install Dockerfile, `.dockerignore`, `PERSONAL.md`, `AGENTS.md` 추가/수정. 기존 lockfile 설치를 완료했고 새 dependency/lockfile 변경은 없다.
- 앱: `check-room-relay.node-test.mjs`, collaboration 설계 및 운영/로드맵/결정/결과 문서 추가. mock Socket이 아닌 실제 Socket.IO 클라이언트로 합성 AES-GCM bytes를 전달한다. 자기 방 relay/decrypt 일치, 다른 방 reliable/volatile 주입 차단, 비참여자/잘못된 binary/IV 차단, 같은 방 follow 유지/다른 방 차단, socket 재접속 후 relay, polling 허용/외부 Origin WebSocket 거부 확인. negative delivery 판정은 로컬 250ms 관찰 범위다.
- 기존 앱 협업 회귀 2개 통과. Node relay 하네스 parent 포함 7개 통과. 서버 `yarn build`, `yarn test:code`, 변경 하네스 scoped lint 통과. 마지막 shutdown/config 수정 후 서버를 중지/재기동하고 같은 하네스를 다시 실행했다.
- relay는 127.0.0.1:3002에서 계속 실행하며 app은 기존 3001을 유지한다. 개발 앱 endpoint는 이미 localhost:3002였으므로 프론트 변경/재빌드는 필요 없다. 서버에는 실제 사용자 데이터 저장소가 없다.
- 최종 가드레일 7개 app 변경 파일, 양쪽 저장소 diff check 및 변경 문서/코드 scoped formatting 통과. 서버 소스는 별도 저장소의 build/lint로 검사하며 app 가드레일의 스캔 범위에 포함된 것으로 표기하지 않는다.

생략/남은 위험: 두 브라우저의 실제 동시 scene 편집/undo/이미지/재연결, Docker build, 공개 host/TLS/sleep, dependency 보안 검토/업데이트, rate limiting. Origin은 Node client가 위조할 수 있어 계정 인증으로 간주하지 않는다. Firebase persistence 독립은 Milestone 8이며 아직 변경하지 않았다. 앱 코드 변경이 없어 전체 app typecheck/lint/tests/build는 재실행하지 않는다. 공개 배포/운영 endpoint 전환과 Milestone 7 전체 완료는 아니다.

## 2026-10-09 통합 및 배포 준비

### 커밋 및 원격 통합 결과

- 제품/회귀 검사/문서/하네스/migration 파일 18개를 `1a246109`로 커밋하고 기능 브랜치를 push했다. 변경 코드 scoped lint(초기화 수정 포함), diff check 및 가드레일도 통과했다.
- GitHub Vercel status success, Preview deployment `6952461608` success 및 정확한 제품 commit 일치를 확인했다. 미리보기: https://personal-excalidraw-nbgllfvka-spp6.vercel.app . Safari에서는 Vercel 로그인으로 이동해 앱 UI는 확인하지 못했다. 보호 우회나 OAuth 허용 범위 변경은 하지 않았다.
- 원격 최신 상태를 다시 fetch한 뒤 `personal-cloud`를 `dd1aa82c`에서 `1a246109`로 fast-forward 통합/push했다. 충돌/강제 push/DB 재적용은 없었다. 통합 범위는 30파일이며 이전 기능 커밋들도 포함된다.
- GitHub Production deployment `6952501950` success 및 Source `1a24610910561c476485fe97b8cfc85033ad0ecf`를 확인했다. 배포 URL은 https://personal-excalidraw-m5q2trk63-spp6.vercel.app 이다. 운영 고정 주소 https://personal-excalidraw.vercel.app/version.json 의 응답도 `2026-10-09T03:45:32Z-1a24610`으로 일치해 고정 도메인 반영을 확인했다.
- Safari 운영 고정 주소에서 캔버스/도구/메뉴를 확인했다. 요청한 6개 메뉴는 없고 개인 Google 로그인/내보내기/협업/환경 설정은 유지된다. 메뉴 밖 Plus 배너/Welcome Sign up은 D-017 범위 제외대로 남아 있다. 운영 origin은 비로그인 상태이며 로그인 후 내 그림/폴더/저장/이미지 복원은 이번 검사에서 수행하지 않았다. 운영 데이터를 생성/편집/삭제하지 않았다.
- Vercel Dashboard Ready/Current 표기는 로그인 제약으로 직접 보지 못했으며 GitHub Production success와 실제 고정 도메인 version 응답을 근거로 배포 성공을 판정했다. 로컬 결과를 운영 로그인/저장 완료로 대체하지 않는다. 운영 배포 결과 문서는 기능 브랜치에 별도 커밋하므로 제품 운영 Source는 계속 `1a246109`다.

원격 fetch 결과 통합 기준선 `origin/personal-cloud`의 `dd1aa82c`가 현재 기능 브랜치의 조상임을 확인했다. force push/rebase/DB 재적용 없이 fast-forward 통합 가능한 상태다. 이번 범위에는 기존 URL 오류 안내, 이미지 초안/백업, scene 저장 실패 회귀 검사와 새로고침 수정/Workspace/메뉴 정리가 함께 포함된다. upstream core/dependency 변경은 없다.

커밋 전 관련 자동 검사 3파일 14개와 비로그인 접근 하네스 자체 검사 6개 통과. 직전 동일 제품 코드의 typecheck/build 및 Safari 메뉴/검색 확인 결과를 재사용한다. 전체 suite/심화 장애 검사는 재실행하지 않는다. Vercel Safari 세션은 로그인 화면이므로 기존 프로젝트 계정 로그인을 요청했다. Preview/Production Source 확인 전에는 운영 반영 완료로 기록하지 않는다.

## 2026-10-09 Workspace 구현 및 메뉴 정리

사용자 요청으로 심화 안정화 검사를 보류하고 기능 구현을 우선했다(D-017). 기존 미커밋 새로고침 수정/접근 하네스는 보존한다. upstream core와 dependency, scene/파일 저장 프로토콜은 변경하지 않았다. commit/push/병합/운영 프론트 배포는 하지 않았다.

- `cloud/folders.ts`: 폴더 CRUD 및 단일 upsert 기반 그림 이동. owner를 클라이언트에서 지정하지 않으며 조회/변경 실패를 표시한다.
- `components/cloud/Dashboard.tsx`, `.scss`, `.test.tsx`: 한 단계 폴더 관리, 그림별 이동, 미분류, 제목 검색. 계정/목록 generation 확인 및 폴더 조회 실패 시 기존 그림 목록 유지. 신규 그림은 미분류에서 시작한다.
- `components/AppMainMenu.tsx`: 요청한 Excalidraw+/GitHub/X/Discord/Sign up/Visual Debug 메뉴만 숨겼다. 개인 Cloud 로그인/내 그림과 기존 편집/내보내기/협업을 유지한다. 메뉴 밖 Plus 배너/command palette는 이번 범위가 아니다.
- `20261009040000_create_workspace_folders.sql`: 기존 프로젝트 SQL Editor에서 적용 성공. 사전 두 테이블 부재를 확인했다. 별도 폴더/분류 테이블과 RLS를 추가하며 기존 drawings schema는 그대로다. 폴더 삭제는 관계만 제거하고 그림/이미지를 삭제하지 않는다.
- DB rollback 검사 6항목 모두 true: 소유자 생성/배정, 다른 계정 폴더/관계 숨김, 자기 폴더에 다른 계정 그림 연결 거부, 폴더 삭제 후 그림 보존/미분류. 실제 두 JWT UI 검사가 아닌 DB authenticated 역할/claims 기반 검사다. 전체 transaction을 rollback해 시험 데이터는 남기지 않았다.
- typecheck와 변경 코드 scoped lint 통과. 폴더 저장소/Dashboard/실제 초기화 관련 3파일 14개 검사 통과.
- `yarn build` 통과. 기존 폰트/chunk/Browserslist/Node 경고는 남아 있다. 빌드 중 개발 서버를 잠시 중지한 뒤 같은 `http://127.0.0.1:3001/`에 다시 시작했다.
- Safari 기존 TEST 탭에서 메뉴의 요청 항목 부재, 개인 내 그림/로그아웃 유지, 폴더 도구 활성화/그림별 미분류 선택 상자, 제목 검색 `backup`의 1행 필터 및 검색 해제 후 2행 복귀를 확인했다. 데스크톱 화면의 텍스트/도구 겹침은 없었다. 실제 폴더 생성/이동/삭제 UI 및 모바일 화면은 이번 수동 검사에서 실행하지 않았다. DB rollback과 자동 검사 결과와 구분한다. 기존 그림/이미지를 수정하거나 삭제하지 않았다.

생략/남은 범위: 전체 app suite/전체 lint 재실행, 두 계정 폴더 UI 대조, 다른 기기/느린 응답/장애 주입, 중첩 폴더/공유/일괄 이동/계정 일괄 백업. 기존 안정화 미검증 항목은 유지하며 Milestone 6 전체 완료로 표시하지 않는다.

## 2026-10-09 Storage 삭제 격리 및 TEST PNG 정리

사용자가 직전 생성한 합성 TEST PNG의 삭제 검사/최종 정리를 승인했다. 대상은 2×2 PNG 한 개로 고정했으며 기존 그림/버전/metadata에서 참조하는 이미지는 삭제하지 않았다.

- Safari 개인정보 보호 창의 다른 로그인 계정으로 기존 SDK remove([정확한 TEST 경로])를 호출했다. 오류는 없지만 returnedObjects는 0이었다. HTTP 성공 응답을 실제 삭제나 명시적 권한 오류로 오인하지 않는다.
- 소유자 창에서 PNG를 다시 다운로드해 생성 bytes와 일치를 확인했다. 다만 이 요청은 캐시를 우회하지 않았으므로 독립적인 서버 보존 증거로 단정하지 않는다. 이어 metadata 참조 0행을 확인하고 소유자 remove로 실제 1개 삭제 응답을 받았다. 다른 계정 0개/소유자 1개 대조가 삭제 격리 증거다.
- 소유자 목록에서는 TEST 파일이 사라졌지만 일반 download는 bytes를 반환했다. cacheNonce에 신규 UUID와 fetch cache no-store를 함께 사용한 재요청에서는 data 없음, SDK status 400/statusCode 404/NoSuchKey를 확인했다. 서버 삭제 후 캐시 bytes가 남을 수 있으며 이를 RLS 우회/서버 삭제 실패로 확정하지 않는다. 기존 수신 bytes나 브라우저 캐시까지 원격 삭제로 회수되는 것은 아니다.
- TEST 컨텍스트는 두 창 모두 제거했고 검사기를 닫았다. 기존 그림 제목/초 단위 수정 시각 유지와 기존 이미지의 cacheNonce/no-store 다운로드 성공을 확인했다. Safari 화면의 기존 빨간 이미지도 그대로다. 서버/로그인/원본/기존 백업은 유지한다.

이번 변경은 문서와 수동 Storage 요청이다. 가드레일 12개 변경 파일, diff check, README/VALIDATION/operations scoped Prettier 통과. 제품 코드/하네스/migration/정책/commit/배포 변경은 없다. app typecheck/전체 lint/tests/build는 재실행하지 않는다. 실제 JWT metadata 쓰기/서명 URL, 두 탭 local scene/지연 파일, 강제 종료/eviction 및 캐시 없는 다른 기기 복원은 남긴다. Milestone 6 전체 완료는 아니다.

## 2026-10-09 파일 metadata 및 Storage 쓰기 검사

Milestone 6. 제품 코드/정책/migration/dependency/upstream core/commit/배포는 변경하지 않았다. 기존 미커밋 작업을 유지하고 `check-file-write-isolation.sql` 하네스를 추가했다.

### DB metadata

Safari 관리자 SQL Editor에서 하네스와 같은 전체 transaction을 실행했다. TEST 복원본의 실제 metadata 하나, DB의 실제 존재하는 다른 사용자 ID, 원 scene을 복사한 transaction 한정 임시 외부 parent 그림을 사용했다. 계정/scene 값을 결과나 fixture에 출력하지 않는다. 실제 사용자 JWT 요청이 아닌 DB 역할/claims 검사다.

13항목 모두 true: bypass 없는 authenticated 역할, file CRUD grants, 소유자 metadata INSERT/UPDATE/DELETE 각 1행, 다른 사용자 UPDATE/DELETE 각 0행, owner 위조 INSERT/parent 위조 INSERT 및 file owner 변경/foreign parent 변경/drawing owner 변경의 42501 거부, 원 metadata 전체 JSON 일치. 기존 file ID/경로/content를 영구 재작성하지 않았다.

각 mutation은 subtransaction으로 취소되고 전체 transaction도 rollback했다. 후속 보존 조회 5항목 모두 true: context/result 없음, 임시 parent 없음, probe metadata 없음, 원 TEST 그림의 제목/수정 시각 유지. 임시 parent는 실제 FK 대상이므로 parent/owner 거부를 FK 오류로 오인하지 않는다. 실제 binary 파일의 삭제는 수행하지 않았다.

### Storage HTTP

기존 Safari 일반/개인정보 보호 창의 SDK client로 실제 두 계정 요청을 비교했다. 원본 scene/버전/metadata에 연결하지 않은 2×2 합성 PNG 한 개를 신규 `TEST-storage-rls-*` 경로에 생성했다. 소유자 upload(upsert false)와 update 모두 성공했다. 다른 계정은 별도 신규 TEST 경로 생성과 이 합성 PNG update 모두 오류로 거부됐다(SDK status 400/statusCode 403, new row violates row-level security policy). 기존 실제 이미지는 대상이 아니다.

후속 소유자 다운로드에서 합성 PNG의 bytes가 생성본과 완전히 같음을 확인했고, 소유자 목록에서 거부된 새 파일 이름의 부재를 확인했다. 합성 PNG 한 개는 현재 남아 있다. 다른 계정 삭제 차단 검사 및 소유자 최종 영구 삭제에 대한 확인을 요청했다. 삭제 검사/정리 완료로 기록하지 않는다. signed URL 및 실제 metadata JWT 쓰기 요청은 별도다. 검사기는 모두 닫고 두 창의 로그인/캔버스와 dev 서버는 유지했다.

검증: 새 SQL과 동일한 transaction 실실행 13항목 및 rollback 뒤 보존 5항목 통과, 가드레일 12개 변경 파일, diff check, README/VALIDATION/operations scoped Prettier 통과. 하네스 SQL/문서와 수동 요청만 변경해 app typecheck/전체 lint/test/build는 재실행하지 않았다. SQL Editor의 private snippet에는 검사 SQL이 남을 수 있다. ROADMAP/DECISIONS 전체 포맷 부채는 일괄 정리하지 않았다.

## 2026-10-09 실제 두 계정 Storage 다운로드 격리

사용자가 Safari 개인정보 보호 창의 다른 계정 로그인을 완료했다. 일반/개인정보 보호 창 모두 기존 로컬 origin을 사용했다. 페이지의 기존 SDK client로 읽기만 실행했으며 JWT/암호를 추출하거나 로그인/설정을 변경하지 않았다.

- 일반 창에서 TEST 복원본의 파일 metadata 한 건을 조회하고, 해당 경로를 기존 Storage SDK download로 요청했다. 다운로드 성공 및 nonempty bytes를 확인했다. scene/이미지 bytes/credential은 출력하지 않았다.
- 개인정보 보호 창의 앱 인증 상태 signed-in과 사용자 ID가 파일 경로의 소유자 ID와 다르다는 boolean을 확인했다. 이메일/사용자 ID는 검증 문서에 기록하지 않는다.
- 동일한 bucket/path에 대한 다른 계정 download는 data 없음과 오류를 반환했다. SDK error의 status는 400, statusCode는 404, code는 NoSuchKey, message는 Object not found였다. 403/42501 권한 오류로 잘못 기록하지 않는다. 소유자의 같은 경로 nonempty 성공과 대조한 실제 접근 격리 결과다.
- 다른 계정의 해당 drawing_files ID 조회는 오류 없이 0행이었다. table RLS의 숨김 결과와 Storage 다운로드 차단을 별개로 확인했다.
- 다운로드 응답은 검증 후 버리고 OS 파일로 저장하지 않았다. 시험용 경로만 검사기에서 확인했으며 문서/fixture에는 넣지 않았다. 검사기를 닫았고 두 창의 로그인/캔버스/원본을 유지했다. 데이터 생성/편집/삭제, 임시 fetch hook, DB 정책 변경은 없다.

남은 범위: 파일 metadata INSERT/UPDATE/DELETE, owner 변경 WITH CHECK, Storage 업로드/덮어쓰기/삭제 및 서명 URL은 이번 읽기 검사에 포함하지 않는다. Storage 오류가 존재를 숨긴 것으로 해석할 수 있지만 모든 오류를 권한 차단으로 처리하는 일반 판정 규칙은 아니다. Milestone 6 전체 완료/운영 최신 배포는 아니다.

검증은 실제 Safari의 읽기 요청과 문서 변경이다. 가드레일(11개 변경 파일), diff check, README/VALIDATION/operations scoped Prettier 통과. 제품 코드/하네스 코드를 바꾸지 않아 typecheck/lint/app tests/build는 재실행하지 않는다. 직전 URL 자동 검사 12개/Node 하네스 6개 및 전체 앱 검증 기록은 아래 항목을 따른다.

## 2026-10-09 URL 통신 장애 및 rollback DB 권한 검사

Milestone 6 후속 검증이다. 기존 미커밋 변경은 유지한다. 이번 추가 범위는 하네스 SQL과 문서이며 제품 코드/정책/migration/로그인/배포/commit 변경은 없다.

- Safari 로컬 TEST 탭의 특정 drawing GET을 TypeError로 거부했다. 기존 로그인 자체는 바꾸지 않고 앱의 준비 상태를 잠시 loading으로 전환해 URL 로더를 재실행했다. 실제 회선 장애/신규 로그인/최초 페이지 진입 검사는 아니다.
- 오류 안내가 통신/접근 확인, 요청 그림의 내용이 아님, Cloud 자동 저장 연결 해제를 명시했다. 안전 metadata 확인 결과 실패 GET 4회(SDK 재시도 포함), 차단된 쓰기 0회, 현재 drawing 연결 null이었다. HTTP 권한 거부로 판정하지 않는다.
- fetch hook을 원복하고 제거 여부 true를 확인했다. 검사기를 닫고 TEST 복원본을 다시 열어 정상 URL과 빨간 이미지 표시를 확인했다. 그림 생성/편집/삭제는 없었다. 오류 동안 기존 이미지의 시각적 보존 및 오류 뒤 편집은 이번 Safari 검사로 입증하지 않는다. 관련 자동 검사와 구분한다.
- `check-rls-isolation.sql`과 같은 SQL을 Safari의 해당 프로젝트 관리자 SQL Editor에서 전체 실행했다. authenticated 역할/임시 claims로 검사했으며 service role 또는 JWT를 출력/추출하지 않았다. TEST 복원본 하나만 대상으로 한다.
- 13항목 모두 true: bypass 없는 authenticated 역할, drawing CRUD grants, 소유자의 그림/파일 metadata/버전/참조 Storage 가시성, 임시 다른 사용자 ID의 네 종류 읽기 차단, 그림 UPDATE/DELETE 0행, 소유자 위조 INSERT 거부. INSERT의 42501만 거부로 인정하고 다른 오류는 성공으로 처리하지 않는다.
- 각각의 쓰기는 예외 subtransaction으로 항상 취소하고 전체 BEGIN/ROLLBACK도 사용했다. 후속 읽기 SQL의 4항목 모두 true: 임시 context/result 없음, TEST 그림의 제목/초 단위 수정 시각(2026-10-04 20:33:16 KST) 유지, probe 그림 미존재. SQL Editor의 private 검사 snippet은 자동 저장될 수 있지만 실제 scene/owner/credential 값은 SQL 본문에 없다.

검증: URL 로더/Dashboard/실제 초기화 3파일 12개 통과, Node 비로그인 하네스 6개 통과. 가드레일 11개 변경 파일, diff check, README/VALIDATION/operations scoped Prettier 통과. 이번 하네스/문서 추가에 app typecheck/전체 lint/전체 test/build는 재실행하지 않는다. 같은 제품 코드의 직전 전체 검증은 아래 초기화 경합 수정 기록을 따른다. ROADMAP/DECISIONS의 기존 전체 포맷 부채는 일괄 수정하지 않았다.

남은 범위: 임시 DB claims는 실제 다른 계정 JWT/Storage HTTP 서비스 검사가 아니다. 파일 metadata INSERT/UPDATE/DELETE, 소유자 변경 UPDATE WITH CHECK, Storage 업로드/삭제/서명 URL, 강제 종료/eviction 및 다른 기기 복원은 별도다. 실제 두 계정 Storage 검사에 필요한 Safari 개인정보 보호 창의 다른 계정 로그인을 요청했다. 로컬 서버/TEST 그림은 유지하며 Milestone 6 전체 완료로 판정하지 않는다.

## 2026-10-09 Cloud URL 초기화 경합 수정

Milestone 6 / D-016. 이전 미커밋 문서와 비로그인 하네스는 유지한다. commit/push/병합/운영 배포/DB migration/dependency/upstream core 변경은 없다.

### 원인과 수정

편집기 API는 initialData 적용 완료 전부터 사용할 수 있었다. Dashboard는 API 존재만 확인하고 Cloud 그림을 먼저 열었고, 나중에 core 초기화가 빈 로컬 elements를 적용해 원격 scene을 덮을 수 있었다. 새 `Dashboard.initialization.test.tsx`에서 실제 Excalidraw와 지연된 initialData를 연결해 수정 전 최종 elements가 빈 배열이 되는 실패를 재현했다. 원격 DB 요청/초안 저장소는 mock 경계이며 core 편집기는 mock하지 않았다.

- `components/cloud/Dashboard.tsx`: 공개 getAppState/onChange API로 initialData 적용 완료를 기다린 뒤 URL을 연다. 준비 구독은 완료/교체/unmount 때 해제하며 기존 Strict Mode/계정/generation 검사를 유지한다.
- `App.tsx`: Cloud drawing이 연결된 탭에는 다른 탭의 전역 LocalData 동기화를 적용하지 않는다. 초기/탭 동기화 로컬 이미지 조회의 늦은 응답은 drawingId와 generation을 검사하고 버린다. 익명 local-first의 기존 경로는 유지한다.
- `Dashboard.initialization.test.tsx`: 초기 인증 완료/인증 로딩의 두 경우, 지연된 빈 initialData, 실제 편집기, Strict Mode에서 초기화 후 원격 elements 유지와 단일 URL 조회를 검사한다.
- README/ROADMAP/DECISIONS/VALIDATION/operations: 로컬 수정 결과와 미검증 범위를 기록한다.

### 검증

- `yarn test:typecheck`, `yarn test:code`, `yarn build`: 통과. 기존 MetaProperty parser, 폰트/chunk/Browserslist 및 Node deprecation 경고는 남아 있다.
- 전체 `yarn test:app --watch=false`: 128 files, 1,902 passed, 47 skipped, 1 todo. 준비 구독 cleanup 조건의 마지막 소규모 변경 후 Dashboard/실제 초기화 8개와 scoped lint를 다시 확인했다.
- 가드레일(10개 변경 파일), `git diff --check`, 변경 코드와 README/VALIDATION/operations scoped Prettier 통과. 기존 ROADMAP/DECISIONS 전체 문서 포맷 부채는 일괄 수정하지 않았다.
- Safari 기존 로그인 세션의 TEST 복원본 URL을 새 탭에서 직접 열었다. 이미지 자동 표시, 같은 탭 새로고침 두 번, 별도 새 탭에서 같은 URL 이미지 표시를 확인했다. 초안 안내/빈 캔버스/불필요한 종료 경고는 나타나지 않았다. 목록의 복원본 수정 시각은 2026-10-04 20:33:16으로 유지됐다.
- 브라우저에서 데이터 생성/편집/삭제, 로그인 변경, 설정 변경, 장애 주입은 하지 않았다. 중복 검증 탭 하나만 닫았고 테스트 그림/원본은 유지했다. 로컬 dev 서버는 `http://127.0.0.1:3001/`에 시작했으며 계속 실행한다.

생략/남은 위험: 이번 Safari 검사는 같은 브라우저의 캐시 있는 TEST 그림이다. 다른 기기 캐시 없는 복원, 서로 다른 전역 로컬 scene의 두 탭, 느린 로컬 파일 응답, 실제 장애에서 새 복구본 생성, 프로세스 강제 종료/eviction, 직접 Storage/쓰기 RLS, URL 네트워크 오류 UI는 별도다. 공유 hash/협업 실기기 검사는 재실행하지 않았고 기존 자동 전체 검사로 회귀 확인했다. 로컬 수정 확인은 운영 배포 완료나 Milestone 6 전체 종료를 의미하지 않는다.

## 2026-10-06 문서 정리 및 인계

이번 작업은 기존 Git 상태와 검증 기록을 대조한 문서 정리다. 제품 코드 변경, 브라우저 재검사, 운영 DB 요청/설정 변경, 데이터 정리, 서버 재시작/종료, commit/push/병합/배포는 하지 않는다. 마지막 수동 검사는 아래 2026-10-04 Safari 기록이다. 과거 항목의 대기/미완료 표현은 당시 상태이며 현재 요약은 README/ROADMAP을 따른다.

- 완료한 범위: 기반 Cloud 기능, 최소 버전 기록 복원, 이미지 저장 상태/재시도, 이미지 포함 초안 및 현재 그림 백업, 두 계정 URL/목록 격리, 비로그인 table 조회 거부
- 최신 자동 앱 검증 기록: 127 files, 1,900 passed, 47 skipped, 1 todo. 이는 2026-10-04 기록이지 이번 전체 테스트 재실행 결과가 아니다.
- 최우선 미해결: Safari에서 복구 뒤 URL 새로고침 시 빈 캔버스 두 번 재현. 내 그림 재열기는 정상. 원인/데이터 유실은 미확정이며 초기화 전체 경로의 회귀 테스트와 원인 조사부터 재개한다.
- 미검증: URL 네트워크 오류 UI, 직접 Storage/쓰기/삭제 RLS, 프로세스 강제 종료/eviction 및 다른 기기 캐시 없는 파일 복원
- 인계 상태: `codex/cloud-file-save-status`, HEAD `737c21a8`, 기능 커밋 `0387136c`. 후속 문서 및 비로그인 하네스 두 파일은 미커밋 상태로 유지한다. 운영 배포된 코드와 동일하다고 가정하지 않는다.

수정 문서: README(현황/재개 순서), ROADMAP(오래된 체크리스트 정합성), DECISIONS(초안 검증 한계), VALIDATION(마무리 기록). operations의 실행/재시작/백업 가이드는 유지한다. typecheck/앱 lint/전체 app tests/build는 문서-only 정리라 생략한다. 기존 문서 전체 포맷 부채는 이번 작업에서 일괄 재포맷하지 않는다.

이번 문서 검사: `node personal-cloud-harness/check-guardrails.mjs`(7개 변경 파일), `git diff --check`, README/VALIDATION scoped Prettier 모두 통과했다. ROADMAP/DECISIONS 전체 Prettier는 기존 형식 부채 때문에 이번에는 검사하지 않았다.

## 2026-10-04 Safari 업로드 장애와 초안 재열기

사용자가 Safari 개발자용 기능을 켠 뒤 일반 창의 테스트 복원본 `df912b92-80e3-46d8-8fd4-dd2160180cdd`만 사용했다. Chrome은 사용하지 않았다. 중단돼 있던 로컬 Vite 서버를 기존 origin `http://127.0.0.1:3001/`에 재시작했다. 제품 코드, dependency, migration, 운영 배포는 변경하지 않았다.

- Safari 웹 검사기에서 해당 테스트 drawing의 Storage POST/PUT만 실패하도록 탭의 fetch를 임시 감쌌다. navigator.onLine도 false로 주입했다. scene 저장 요청은 차단하지 않았으며 노트북 Wi-Fi나 Supabase 설정은 변경하지 않았다. 실제 회선 단절/서비스 장애와는 구분한다.
- 기존 테스트 export PNG를 이미지 도구로 추가했다. 업로드 차단 횟수 2와 offline 신호를 확인했고 `오프라인 — 연결 후 다시 시도하세요` 및 `저장 다시 시도`가 표시됐다.
- 실제 탭 닫기와 종료 경고의 페이지 나가기를 실행했다. 탭 수가 4개에서 3개로 줄었고 새 탭에서 같은 URL을 열자 4개가 됐다. 다른 일반 창 탭과 두 번째 계정 창은 유지했다.
- 재열기 후 원격 화면의 누락 이미지 placeholder와 `이 그림에 저장되지 않은 로컬 변경사항이 있습니다` 안내를 확인했다. `로컬 변경 사용` 뒤 실제 빨간 테스트 이미지, `이미지 업로드 중…`, 이어 `저장됨`을 확인했다. 이는 실제 Safari의 문서별 IndexedDB 초안 재열기/이미지 재업로드 확인이다.
- 새로고침 후 콘솔에서 임시 hook이 undefined이고 navigator.onLine이 true인 것을 확인했다. 검사기를 닫았으며 요청 실패 주입은 남지 않았다. 사용자가 켠 개발자용 기능 설정 자체는 그대로 유지했다.

### 발견한 미해결 문제

복구 완료 뒤 같은 URL 새로고침에서 캔버스가 빈 화면으로 표시됐다. 내 그림 목록에서 복원본을 다시 열면 빨간 이미지가 정상 표시됐다. 이를 반복해 두 번 재현했고 테스트 탭은 목록에서 다시 열어 이미지가 보이는 상태로 남겼다. 목록의 수정 시각은 두 번 모두 재업로드 완료 시각으로 유지됐다. 서버 그림이 삭제됐다는 증거는 없지만 새로고침 자동 표시 검사는 실패로 기록한다. 새로고침마다 종료 경고도 나타났으며 그 원인은 별도 확인이 필요하다.

우선 조사 위치는 `App.tsx`의 initializeScene/initialStatePromise 및 LocalData 탭 동기화, `Dashboard.tsx`의 URL 자동 열기 effect, `openDrawing.ts`의 generation/잠금이다. 초기 로컬 복원과 Cloud 열기의 순서 또는 여러 탭 동기화는 후보이지 확정 원인이 아니다. 초기화 전체 경로를 재현하는 회귀 테스트 후 수정한다.

변경 문서: README, ROADMAP, VALIDATION, operations. 원본 테스트 그림/사용자 데이터는 삭제하거나 덮어쓰지 않았다. 테스트 복원본에는 이번 새 이미지가 저장돼 있다. 프로세스 강제 종료, 저장소 eviction, 실제 회선 단절, 다른 기기 캐시 없는 파일 복원, 직접 Storage/UPDATE/DELETE RLS 검사는 생략했다. 문서-only 후속 변경이므로 typecheck/lint/전체 app tests/build는 재실행하지 않는다. Milestone 6 전체 완료로 판정하지 않는다.

문서 검증: 가드레일(7개 변경 파일), `git diff --check`, README/VALIDATION/operations scoped Prettier 통과. `yarn prettier --check ...`는 저장소 script의 전체 glob까지 검사해 기존 AGENTS/ARCHITECTURE/DECISIONS/ENGINEERING_GUARDRAILS/ROADMAP 형식 차이로 실패했다. 직접 Prettier 실행으로 scoped 검사를 분리했고 기존 문서 전체 재포맷은 하지 않았다.

## 2026-10-04 두 번째 계정 URL 및 접근 검사 하네스

Safari 개인정보 보호 창에서 Google 로그인 화면을 열었고, 사용자가 일반 창과 다른 계정으로 인증을 완료했다. 메뉴의 로그인 계정이 다름을 확인한 후 원 계정 테스트 복원본 `df912b92-80e3-46d8-8fd4-dd2160180cdd`의 URL을 다시 열었다. 찾을 수 없음/권한 없음 안내와 Cloud 자동 저장 연결 해제 설명이 표시됐고, 테스트 복원본은 두 번째 계정의 내 그림 목록에 없었다. 두 번째 계정의 기존 그림은 열거나 수정하지 않았다. 계정 이메일/credential/scene은 문서나 fixture에 기록하지 않았다.

이 결과는 다른 계정 소유 drawing URL의 실제 UI 거부 확인이다. 네트워크 요청을 직접 캡처해 파일 다운로드/UPDATE/DELETE RLS까지 확인한 검사는 아니며 해당 범위는 여전히 별도다. 노트북 네트워크, Safari 설정, 운영 DB 정책은 변경하지 않았다. 개발자용 기능 설정 변경 확인에 답이 없어 테스트 탭 한정 장애 주입/초안 재열기는 미완료로 유지한다.

`personal-cloud-harness/check-anonymous-access.mjs`에 비로그인 읽기 전용 table GET 검사를 추가했다. 예상 프로젝트 ref/HTTPS host/공개 키 종류를 검사한 후 세 table의 ID 컬럼만 요청한다. 401/403 + `42501`만 permission-denied로 처리하며 빈 200, 404, 잘못된 인증, 5xx, 통신 실패는 통과로 오인하지 않는다. 키/응답 본문/예외 상세를 출력하지 않는다. 새 dependency, 앱 코드, DB migration은 없다.

검증: Node 하네스 테스트 6개 통과, 현재 Supabase 프로젝트 실제 실행은 세 table 모두 401 / permission-denied로 통과. 전체 앱 테스트도 다시 실행해 127 files, 1,900 passed, 47 skipped, 1 todo로 통과했다. Node 테스트 파일은 `.node-test.mjs`로 분리해 Vitest의 app test 수집에 섞이지 않게 했다. 가드레일, diff check, Node syntax 검사, 신규 하네스/README/VALIDATION/operations scoped Prettier 통과. scoped ESLint는 CLI console 출력 1개 경고를 표준 출력으로 수정한 뒤 통과했다. 하네스-only 변경이라 app typecheck/전체 lint/build는 생략했다. ROADMAP/DECISIONS의 기존 문서 전체 포맷 부채는 정리하지 않았다. 운영 가이드에 재실행 명령과 검사 한계를 추가했다.

## 2026-10-04 Safari 재개 및 비로그인 API 검사

제품 코드 변경 없이 로컬 `127.0.0.1:3001`과 기존 Supabase에서 검사했다. 일반 창의 기존 원본/관리자 탭은 유지하고 `TEST 2026-10-04 backup-restore` 복원본만 사용했다.

- 테스트 복원본의 편집 탭을 실제 닫은 뒤 새 탭에서 같은 drawing URL을 열었다. Safari 접근성 정보로 탭 수 감소/새 탭 증가를 확인했다. 이미지 선택/Crop 제어 및 빨간 테스트 이미지 픽셀을 확인했다. 정상 저장본의 같은 브라우저 재열기 검사이며, 미저장 초안/오프라인/프로세스 강제 종료 검사는 아니다.
- 로그인된 테스트 탭에서 `00000000-0000-4000-8000-000000000000` URL을 열자 찾을 수 없음/권한 없음, 기존 캔버스가 요청 그림의 내용이 아님, Cloud 자동 저장 연결 해제 안내가 나타났다. 목록의 복원본을 열어 정상 URL과 이미지로 복귀했다. 오류 뒤 원본 삭제/덮어쓰기는 하지 않았다.
- 기존 개인정보 보호 창은 잠겨 있어 사용자가 직접 잠금을 해제했다. 비로그인 창에서 복원본 URL을 열고 `Google로 로그인` 메뉴를 확인했다. Cloud 내 그림 메뉴는 표시되지 않았다. 비로그인 검사는 다른 로그인 계정의 접근 거부 또는 API 격리 검사를 대체하지 않는다.
- 공개 publishable/anon key만 사용하는 읽기 전용 REST GET으로 `drawings`, `drawing_files`, `drawing_revisions`를 조회했다. 실제 프로젝트 host와 공개 키 종류를 먼저 확인했다. 세 요청 모두 HTTP 401, Postgres 오류 코드 `42501`로 거부됐다. 사용자 JWT/관리자 키를 사용하지 않았고 응답 본문, scene, credential은 로그/문서에 남기지 않았다. 비로그인 읽기 권한 확인이며 로그인 계정 간 RLS, Storage 객체 경로, 쓰기/삭제 권한 검증은 별도다.

자동 검사: URL 로더 4개와 Dashboard 6개, 총 10개 통과. 가드레일(4개 변경 문서), diff check, README/VALIDATION scoped Prettier 통과. 제품 코드 변경이 없어 typecheck/lint/전체 app tests/build는 이번 수동 검사에서는 생략했다. 기존 ROADMAP/DECISIONS 문서 전체 형식 부채는 일괄 변경하지 않았다.

남은 항목: 개인정보 보호 창의 두 번째 계정 로그인 후 같은 URL 접근 거부 확인, Safari 개발자용 기능 설정 변경 확인 후 탭 한정 요청 실패/초안 복구. 확인 응답 전에는 설정 변경/장애 주입을 하지 않았다. 노트북 Wi-Fi, Supabase RLS/DB, 운영 웹 배포는 변경하지 않았다. 테스트 복원본과 기존 다운로드 백업은 유지한다.

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
- `localDraftStore.test.ts`, `draftRecovery.test.tsx`, `autosave.test.ts`, `Dashboard.test.tsx`: fake-indexeddb 환경의 IndexedDB API 및 복구 UI 테스트, 기존 회귀 테스트 확장. docs는 README/ROADMAP/DECISIONS/operations/VALIDATION을 갱신한다. upstream core, dependency, DB migration은 변경하지 않는다.

자동 검증:

- IndexedDB API(fake-indexeddb 환경): 이미지 bytes/참조 파일만 저장/문서 분리/legacy record/다른 탭의 최신 token 보존 5개 테스트
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
