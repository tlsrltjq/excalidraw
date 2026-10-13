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

## 지금 어디까지 왔나

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

다시 시작할 때는 이 문서 → ROADMAP의 Milestone 7 → collaboration/VALIDATION의 최신 기록을 읽고, 실행이 필요하면 operations.md를 따른다. Milestone 6 심화 검사는 보류 상태로 유지한다.

제품 변경은 `codex/cloud-file-save-status`의 `1a246109`로 커밋/push하고 `personal-cloud`에 fast-forward 통합/push했다. `737c21a8`(scene 저장 실패 복구 회귀 검사), `0387136c`(이미지 초안/백업)도 포함된다. GitHub Production 배포 success 및 운영 `version.json`의 `1a24610` 일치를 확인했다. Preview 화면은 Vercel 로그인 보호로 미확인이다. 배포 결과 문서는 `f4a6f006`으로 기능 브랜치에 후속 커밋했다. 현재 개발 브랜치는 `codex/personal-collaboration-server`이며 새 협업 서버/하네스/문서 수정은 아직 미커밋이다. 문서 후속 commit이나 로컬 서버 실행을 운영 협업 서버 전환과 혼동하지 않는다.

Safari 재개 검사에서는 저장된 복원본 재열기, 없는 ID 경고 후 정상 복귀, 비로그인 메뉴, 다른 로그인 계정 URL 거부/목록 격리를 확인했다. 비로그인 REST table 조회 세 요청은 모두 거부됐고 `check-anonymous-access.mjs`로 재실행할 수 있다(operations 참고). 최신 URL/Dashboard/초기화 자동 검사 12개와 Node 하네스 6개 통과. Safari 장애 주입은 탭 한정이며 실제 회선 단절은 아니다. rollback DB RLS 13항목과 이후 원본 보존 4항목은 통과했으나 실제 두 계정 Storage HTTP 검사를 대체하지 않는다.

## 다음 시작 순서

2026-10-13 후속: 서버 `e2defb1`을 `origin/codex/personal-room-server`에 커밋/push하고 원격 SHA를 확인했다. 서버 build/lint와 relay 7개, runtime audit 0건 재확인. Safari Render 로그인 후 공개 저장소 연결 설정을 준비 중이며 실제 서비스/운영 endpoint는 아직 변경하지 않았다. 재연결 직후 일시적인 빈 캔버스와 개발 도구 경고는 남아 있다.

1. operations의 시작 절차로 기존 origin `http://127.0.0.1:3001/`을 사용한다. 로컬 앱도 운영 Supabase를 사용하므로 TEST 그림만 조작한다.
2. VALIDATION의 2026-10-09 통합/운영 배포 및 초기화 경합 수정 기록을 확인한다. 제품 코드는 운영 반영했고 로그인 후 운영 기능 확인은 남아 있다.
3. 사용자 요청으로 심화 검사는 보류하고 기능 개발을 우선한다(D-017). 폴더/검색과 메뉴 정리는 로컬 구현했으며 최신 결과는 VALIDATION을 따른다. 보류한 검사는 Milestone 6의 남은 항목으로 유지한다.
4. 다음은 Milestone 7 서버 변경 검토/커밋/push와 Render 계정/플랜 확인 후 공개 배포다. 공개 서버 검증 뒤 운영 endpoint를 전환한다. 이후 협업 persistence 독립, AI Gateway, Local LLM, MCP 순서다. 기능 우선 전환이 Milestone 6 전체 완료를 의미하지 않는다.

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
