# Personal Excalidraw Cloud 문서

이 디렉터리는 Excalidraw upstream 코드와 별도로 개인 Cloud 기능의 계획, 설계 결정, 구현 기록을 관리한다.

## 문서 목록

- [ROADMAP.md](./ROADMAP.md): 전체 구현 순서와 단계별 완료 조건
- [ARCHITECTURE.md](./ARCHITECTURE.md): 개발 흐름, MVP 및 최종 아키텍처
- [DECISIONS.md](./DECISIONS.md): 주요 설계 결정과 미결정 사항
- [ENGINEERING_GUARDRAILS.md](./ENGINEERING_GUARDRAILS.md): 소스 코드와 로직 구현 규칙
- [VALIDATION.md](./VALIDATION.md): MVP 수동/자동 검증 결과와 미해결 항목
- [operations.md](./operations.md): 로컬 서버 실행/재시작, Supabase 복구, Vercel 배포, 장애 진단, DB 접근 정책 확인

## 지금 어디까지 왔나

2026-10-04 기준 Milestone 0~5의 기반 기능(배포, 로그인, 내 그림, 자동 저장, 이미지 저장/복원)을 구현했고 Milestone 6의 MVP 안정화 작업 중이다. URL 로드 실패 안내, 버전 기록 창, 이미지 업로드 완료/실패 상태, 이미지 포함 문서별 로컬 초안 복구를 로컬에서 검증했다. 이미지 포함 export/현재 그림 파일 backup은 자동 검사에 더해 Safari 실제 다운로드/복원 및 복원본의 새 Cloud 그림 저장·새로고침 검사도 완료했다. 다음은 강제 종료/실제 장애 복구 및 남은 권한 오류 수동 검증이다. 계정 전체 일괄 백업은 별도 미구현 기능이다. 로컬 변경과 운영 배포는 별개이므로 Vercel Source commit을 확인해야 한다.

다시 시작할 때는 이 문서 → ROADMAP의 Milestone 6 → VALIDATION의 최신 기록을 읽고, 실행이 필요하면 operations.md를 따른다.

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
└── operations.md
```

계획은 ROADMAP, 설계 이유는 DECISIONS, 실제 확인 결과와 남은 위험은 VALIDATION, 반복 실행 절차는 operations에 기록한다. `cloud-storage.md`, `collaboration.md`, `ai-gateway.md`, `mcp.md`는 내용이 커지거나 해당 단계가 시작될 때 추가할 예정이며 아직 존재하지 않는다. 실행 가능한 검증 도구는 문서 폴더가 아닌 `personal-cloud-harness/`, DB 변경 SQL은 `supabase/migrations/`에 둔다.
