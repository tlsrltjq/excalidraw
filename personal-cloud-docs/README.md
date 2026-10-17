# Personal Excalidraw Cloud 문서

이 디렉터리는 Excalidraw upstream 코드와 별도로 개인 Cloud 기능의 계획, 설계 결정, 구현 기록을 관리한다.

## 문서 목록

- [ROADMAP.md](./ROADMAP.md): 전체 구현 순서와 단계별 완료 조건
- [ARCHITECTURE.md](./ARCHITECTURE.md): 개발 흐름, MVP 및 최종 아키텍처
- [DECISIONS.md](./DECISIONS.md): 주요 설계 결정과 미결정 사항
- [ENGINEERING_GUARDRAILS.md](./ENGINEERING_GUARDRAILS.md): 소스 코드와 로직 구현 규칙
- [VALIDATION.md](./VALIDATION.md): MVP 수동/자동 검증 결과와 미해결 항목
- [operations.md](./operations.md): 로컬 서버 실행/재시작, Supabase 복구, Vercel 배포, 장애 진단, DB 접근 정책 확인
- [collaboration.md](./collaboration.md): 자체 협업 서버 구성, 앱/서버 저장소 경계, 로컬 진행 결과 및 남은 배포 범위
- [collaboration-persistence.md](./collaboration-persistence.md): Milestone 8 저장 계약/Firebase adapter와 Supabase 권한·암호화·동시 저장 설계 후보

## 지금 어디까지 왔나

Milestone 8 relay 제한(2026-10-17): 앱/relay의 `codex/collab-relay-limits`에서 전체/방 연결, 입력 frame·event·byte, 수신자별 전달량과 느린 수신자 대기열을 제한했다(D-032). 프로토콜 DEBUG 출력과 동적 식별자 로그도 차단했다. 로컬 실제 클라이언트 검증과 운영 로그 확인을 구분하며 Render/앱/DB 배포는 바꾸지 않았다. 다음은 배포 전 provider 로그·키/설정 점검, 이후 DB→Edge→relay→실제 두 계정/게스트 검증→flag 활성화 판단이다.

Milestone 8 공유 quota (2026-10-17): `codex/collab-project-quotas`에 협업 scene 32 MiB/파일 4 MiB 슬롯 64개/room 256개/invite 4096개와 DB 공유 분당 요청 예산을 구현했다(D-031). Storage 미예약 경로 차단, 보수적 슬롯 재시도, 실제 두 PostgreSQL 연결의 마지막 용량/요청 경쟁, 기존 권한/CAS 회귀를 확인했다. 운영 migration/Edge/flag는 적용하지 않았다. 다음은 relay 연결·송신 총량과 인프라 로그 검토, 이후 hosted 배포/두 계정·게스트 검증이다. 이 제한은 협업 데이터 대상이며 개인 Cloud/프로젝트 물리 크기·월 대역폭/무료 요금 상한을 보장하지 않는다.

Milestone 8 자원 제한 첫 단위 (2026-10-14): `codex/collab-resource-limits`에서 새 Supabase 파일의 압축 해제 중단 상한과 Edge 파일·ticket의 인스턴스별 요청/동시 처리 제한을 구현했다(D-030). 운영에는 적용하지 않았다. 다음은 DB가 강제하는 프로젝트 총 저장량·분산 요청 quota와 relay 연결/전송 제한·인프라 로그 검토다. 이 단위만으로 무료 사용량/공개 abuse 보호가 완성됐다고 보지 않으며 운영 flag off를 유지한다.

Milestone 8 소유자 방 관리 (2026-10-14): `codex/collab-room-management`에 내 협업 방 메뉴/빈 방 생성, 편집·읽기 전용 초대, 1시간·1일·7일 만료, 복사·폐기·키 복구·부분 실패 재시도를 구현했다. 기본 off flag와 운영 Firebase는 유지한다. 새 캔버스를 자동 열거나 현재 개인 그림을 복사하지 않는다. 다음은 공개 rate/용량·로그/메모리 제한을 마무리하고 미적용 DB/Edge/relay를 순서대로 적용해 실제 두 클라이언트로 확인하는 단계다. 사용 방법은 operations, 검증/미확인은 VALIDATION 최신 기록을 따른다.

Milestone 8 입장 화면/controller 연결 (2026-10-14): `codex/collab-entry-integration`에서 선택→입장 ACK→Supabase scene 준비→캔버스 전환을 연결했다. 초기 실패/취소에는 기존 scene/files/개인 그림 연결을 보존하며 초기 peer 업데이트를 bounded queue로 병합한다. 재연결 병합·읽기 전용 잠금·저장/파일/포인터/follow 전송 방어와 종료 cleanup을 구현했다. **`VITE_COLLAB_SUPABASE_ENABLED`는 기본 off이며 운영에 켜지 않았다.** 다음은 사용자용 새 방 생성/초대 관리, 공개 활성화 전 용량·로그·rate 제한 및 hosted DB/Edge/relay 적용·두 실제 클라이언트 검증이다. 결과와 생략은 VALIDATION 최신 기록을 따른다.

Milestone 8 프론트 세션 기반 (2026-10-14): `codex/collab-client-session`에서 입장권 요청 client와 ACK 이후 준비 완료되는 transport worker를 구현했다. 30초 전 갱신, read/write 상태, timeout/만료/visibility 복귀/재연결/stale 응답/정리를 처리하고 실제 loopback relay와 입장·갱신·read 다운그레이드를 확인했다. **아직 선택 화면/controller/provider에 연결하지 않았다.** 다음은 입장 ACK와 원격 scene 준비가 성공한 뒤 캔버스를 전환하고 실패 시 현재 scene을 보존하는 통합 단위다. 운영 배포/새 방 UI 잠금은 유지한다.

Milestone 8 relay 입장 연결 (2026-10-14): 앱/서버의 `codex/collab-relay-admission`에서 새 방 공개 키 검증, socket challenge, join/renew ACK, 만료 종료와 read/write 송수신·follow 검사를 구현했다. 운영 Render에는 배포하지 않았고 프론트 입장/provider 연결은 아직 남아 있다. 기본 Firebase와 새 방 UI 잠금은 유지한다. 로컬 실행/검사 방법은 operations, 실제 결과와 한계는 VALIDATION을 따른다.

Milestone 8 입장권 기반 (2026-10-14): `codex/collab-relay-ticket`에서 60초 ECDSA 입장권 signer/verifier, 제한된 HTTP 발급 handler와 초대 RPC를 사용하는 미배포 Edge entrypoint를 작성했다. relay에는 공개 키만 전달하는 계약이며 ticket은 room/Origin/socket challenge/read-write에 묶인다. 실제 relay 입장/갱신·읽기 전용 전송 제한과 프론트 연결은 다음이며 운영 배포/키 등록은 하지 않았다. 새 방 gate와 기본 Firebase는 유지한다.

Milestone 8 통합 adapter 단위 (2026-10-14): `codex/collab-supabase-adapter`에서 scene CAS와 private 파일을 하나의 Supabase persistence factory로 묶었다. controller/Portal 및 공유 FileManager에 방 전환/reset 이후 늦은 응답·정리 작업을 차단하는 경계를 추가했다. 기본 provider는 Firebase이며 새 방 실제 입장/운영 DB·함수 적용은 아직 하지 않았다. 다음은 relay ticket 발급·검증과 실제 입장 연결, 읽기 전용 UI/전송 제한이다. 검증 범위와 남은 위험은 VALIDATION의 최신 기록을 따른다.

Milestone 8 private 파일 단위 (2026-10-14): `codex/collab-private-files`에서 collab-files private bucket/RLS migration, 매 요청 초대를 검사하는 Edge 파일 프록시와 client save/load를 구현했다. 기존 encoder/decoder로 암호문 복원·부분 실패·재시도·다른 room/key·stale 결과를 검사했다. 집중 앱 테스트 118개, 로컬 Storage 정책 11항목 및 기존 scene 28항목/경쟁 검사, Deno 타입 검사를 통과했다. 운영 DB/함수 배포/기본 provider 연결은 아직 하지 않았고 다음은 전체 Supabase adapter와 relay ticket 연결이다.

Milestone 8 입장 선택 화면 (2026-10-14): `codex/collab-entry-choice`에서 새 초대의 로그인/게스트 선택, RPC 권한 확인/오류 재시도, 같은 탭의 5분·일회용 OAuth 복귀를 연결했다. 게스트 client는 Workspace 로그인 세션과 분리한다. 기존 링크는 Firebase를 유지하고 새 route는 기존 소켓/그림 자동 열기로 우회하지 않는다. 초대 확인 성공은 실제 공동편집 연결 성공이 아니며 Storage/relay ticket/전체 adapter와 운영 DB 적용은 남아 있다. 집중 검사 87개와 타입/린트/빌드 검증, Safari 확인 여부는 VALIDATION을 따른다.

Milestone 8 서버 scene 단위 (2026-10-13): `codex/collab-scene-rpc`에 owner room/초대 관리, 로그인·게스트 공통 proof 검증과 scene CAS SQL/RLS, 미연결 Supabase scene store를 구현했다. 일회용 PostgreSQL에서 권한 검사 28개/rollback/두 DB 연결 CAS 경쟁을 확인했고 집중 앱 테스트 50개를 통과했다. 운영 Supabase migration 적용·Storage·relay ticket·입장 선택 화면·provider 활성화는 아직 하지 않았다. 재현 방법은 operations의 일회용 협업 DB 검사에 있다.

Milestone 8 후속 (2026-10-13): 사용자 요청으로 새 방은 로그인/게스트 선택 지원으로 설계했다(D-020). `codex/collab-invite-cas`에서 초대 route/proof 처리와 암호화 scene single-flight/CAS worker를 구현·검증했다. 기존 Firebase는 유지하며 새 방 입장 UI/gateway/DB/RLS/Storage/relay ticket은 아직 연결하지 않았다. 다음은 이 서버 측 권한·저장 구현과 선택 화면 연결이다.

Milestone 8 첫 단위 구현 완료 (2026-10-13): `codex/collab-persistence-adapter`에서 저장 계약/Firebase adapter와 controller 연결, 집중 테스트 10개 및 typecheck/lint/build를 완료했다. 현재 Firebase 동작과 운영 배포는 유지한다. 다음은 Supabase room 권한/route/CAS 최종 설계 및 adapter 구현이다. 상세 범위는 collaboration-persistence.md를 따른다.

2026-10-13 최신: 자체 협업 서버 Render Free 배포 및 운영 앱 연결 완료. 서버 `e2defb1`, 운영 앱 Source `d86d9e27`, version `d86d9e2`와 실제 bundle의 개인 relay 주소 확인. 공개 relay를 연결한 localhost:3003 앱에서 Safari/별도 브라우저 양방향 편집·새로고침 재참여 확인. 임시 Origin은 제거하고 실제 차단 검사 통과. 운영 주소의 자동 브라우저 접근은 저장된 접근 설정에 의해 차단돼 운영 화면 검증은 미완료. 실제 sleep 뒤 복구도 남아 있다. 다음 개발은 Milestone 8 협업 저장 독립 설계이며 Milestone 7 잔여 검증을 완료로 지우지 않는다. 카드·유료 플랜은 사용하지 않는다. 아래 날짜별 기록은 당시 상태다.

2026-10-09 기준, Milestone 0~5의 기반 기능은 구현됐고 **Milestone 6: MVP 안정화는 심화 검증 보류**다. 새로고침 수정/폴더/검색/메뉴 변경을 운영 배포했다. Safari 운영 메뉴 반영은 확인했고 운영 로그인 후 폴더/저장/이미지 복원 확인은 남아 있다. 다음 기능 개발은 Milestone 7 자체 공동편집 서버다.

| 범위 | 현재 상태 |
| --- | --- |
| 기반 기능 | Vercel 기본 배포, Supabase 인증, 내 그림 CRUD, 문서 URL, 자동 저장/충돌 처리, 이미지 저장/복원 구현 |
| 복구 기능 | 저장 상태 분리/재시도, 이미지 포함 문서별 로컬 초안, 최소 버전 기록 및 실제 복원 확인 |
| 백업 | 현재 그림의 `.excalidraw` 및 편집 데이터 포함 PNG/SVG 다운로드·복원 확인; 계정 일괄 백업은 미구현 |
| Safari 장애 검사 | 테스트 탭 한정 업로드 실패 → 탭 재열기 → 초안 복구 → 이미지 재업로드/저장 완료 확인 |
| 접근 검사 | 두 계정 URL/Storage 읽기·생성·덮어쓰기·삭제 격리, 비로그인 GET 거부, rollback drawing 13항목 및 file 쓰기 13항목 통과; 합성 TEST PNG 정리 완료 |
| 새로고침 수정 | 지연된 initialData가 먼저 열린 Cloud scene을 덮는 경합을 실제 편집기 테스트로 재현·수정. Safari 반복 새로고침 2회 및 새 탭에서 이미지 자동 표시 확인 |
| Workspace | 한 단계 폴더 생성/이름 변경/삭제, 그림 이동/미분류, 제목 검색을 로컬 구현. 폴더 DB migration 적용 및 rollback 권한 검사 6항목 통과 |
| 메뉴 정리 | Excalidraw+, GitHub/X/Discord, upstream Sign up, Visual Debug 항목 숨김. 개인 Cloud 로그인과 기본 편집/내보내기/협업 유지 |
| 자체 협업 서버 | Milestone 7 로컬 단계 구현. 개인 Fork/Clone, loopback 서버 및 실제 Socket.IO 클라이언트 검사 완료. 외부 호스팅/운영 전환은 미완료 |

2026-10-04 빈 캔버스 재현 기록은 보존하며 D-016 수정/2026-10-09 검증으로 후속 처리했다. 서버 데이터 삭제/유출을 확정한 결과는 아니다. Safari URL 통신 실패와 실제 두 계정 Storage 격리도 확인했다. 강제 종료/eviction, 실제 JWT metadata 쓰기/서명 URL 등은 남아 있다.

다시 시작할 때는 이 문서 → ROADMAP의 Milestone 8 → collaboration-persistence/VALIDATION의 최신 기록을 읽고, 실행이 필요하면 operations.md를 따른다. Milestone 6 심화 검사는 보류 상태로 유지한다.

제품 변경은 `codex/cloud-file-save-status`의 `1a246109`로 커밋/push하고 `personal-cloud`에 fast-forward 통합/push했다. `737c21a8`(scene 저장 실패 복구 회귀 검사), `0387136c`(이미지 초안/백업)도 포함된다. GitHub Production 배포 success 및 운영 `version.json`의 `1a24610` 일치를 확인했다. Preview 화면은 Vercel 로그인 보호로 미확인이다. 배포 결과 문서는 `f4a6f006`으로 기능 브랜치에 후속 커밋했다. 현재 개발 브랜치는 `codex/personal-collaboration-server`이며 새 협업 서버/하네스/문서 수정은 아직 미커밋이다. 문서 후속 commit이나 로컬 서버 실행을 운영 협업 서버 전환과 혼동하지 않는다.

Safari 재개 검사에서는 저장된 복원본 재열기, 없는 ID 경고 후 정상 복귀, 비로그인 메뉴, 다른 로그인 계정 URL 거부/목록 격리를 확인했다. 비로그인 REST table 조회 세 요청은 모두 거부됐고 `check-anonymous-access.mjs`로 재실행할 수 있다(operations 참고). 최신 URL/Dashboard/초기화 자동 검사 12개와 Node 하네스 6개 통과. Safari 장애 주입은 탭 한정이며 실제 회선 단절은 아니다. rollback DB RLS 13항목과 이후 원본 보존 4항목은 통과했으나 실제 두 계정 Storage HTTP 검사를 대체하지 않는다.

## 다음 시작 순서

2026-10-13 후속: 서버 배포/운영 프론트 연결 완료. 최신 검증은 VALIDATION의 공개 서버 앱 연결 결과를 따른다. 운영 화면과 실제 cold start 확인은 남아 있고, 개발 도구 경고는 runtime audit과 구분한다.

1. operations의 시작 절차로 기존 origin `http://127.0.0.1:3001/`을 사용한다. 로컬 앱도 운영 Supabase를 사용하므로 TEST 그림만 조작한다.
2. VALIDATION의 2026-10-09 통합/운영 배포 및 초기화 경합 수정 기록을 확인한다. 제품 코드는 운영 반영했고 로그인 후 운영 기능 확인은 남아 있다.
3. 사용자 요청으로 심화 검사는 보류하고 기능 개발을 우선한다(D-017). 폴더/검색과 메뉴 정리는 로컬 구현했으며 최신 결과는 VALIDATION을 따른다. 보류한 검사는 Milestone 6의 남은 항목으로 유지한다.
4. Milestone 7 운영 연결은 완료했다. 운영 화면/실제 sleep 복구는 남긴 채 다음 개발은 Milestone 8 협업 persistence 독립 설계, 이후 AI Gateway, Local LLM, MCP 순서다. 기능 우선 전환이 Milestone 6 전체 완료를 의미하지 않는다.

테스트 그림 두 개와 기존 백업은 보존한다. 2026-10-09 Safari 캔버스 변경은 없었고 SQL 쓰기는 rollback했다. Storage 권한 비교용 합성 PNG 한 개는 사용자 승인 후 영구 삭제했다. 원본 영구 삭제/수정/새 그림 저장은 없다. 미저장 작업을 사이트 데이터 삭제나 빈 캔버스 덮어쓰기로 복구하지 않는다.

## 문서 관리 원칙

1. 기능을 구현하기 전에 관련 계획과 완료 조건을 먼저 갱신한다.
2. 구현 중 설계가 바뀌면 코드와 같은 작업에서 문서도 함께 수정한다.
3. 완료한 항목은 체크하고 검증한 명령이나 수동 테스트를 기록한다.
4. 비밀값, API key, OAuth client secret은 문서에 기록하지 않는다.
5. upstream Excalidraw 문서는 수정하지 않고 개인 기능 문서는 이 디렉터리에만 추가한다.

## 문서 추가 기준

현재 존재하는 문서 구조:

```text
personal-cloud-docs/
├── README.md
├── ROADMAP.md
├── ARCHITECTURE.md
├── DECISIONS.md
├── ENGINEERING_GUARDRAILS.md
├── VALIDATION.md
├── operations.md
└── collaboration.md
```

계획은 ROADMAP, 설계 이유는 DECISIONS, 실제 확인 결과와 남은 위험은 VALIDATION, 반복 실행 절차는 operations에 기록한다. 협업 설계는 collaboration에 추가했다. `cloud-storage.md`, `ai-gateway.md`, `mcp.md`는 해당 단계에서 추가할 예정이며 아직 존재하지 않는다. 실행 가능한 검증 도구는 `personal-cloud-harness/`, DB 변경 SQL은 `supabase/migrations/`에 둔다.
