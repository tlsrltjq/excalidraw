# Personal Excalidraw Cloud 문서

이 디렉터리는 Excalidraw upstream 코드와 별도로 개인 Cloud 기능의 계획,
설계 결정, 구현 기록을 관리한다.

## 문서 목록

- [ROADMAP.md](./ROADMAP.md): 전체 구현 순서와 단계별 완료 조건
- [DECISIONS.md](./DECISIONS.md): 주요 설계 결정과 미결정 사항
- [ENGINEERING_GUARDRAILS.md](./ENGINEERING_GUARDRAILS.md): 소스 코드와 로직 구현 규칙

## 문서 관리 원칙

1. 기능을 구현하기 전에 관련 계획과 완료 조건을 먼저 갱신한다.
2. 구현 중 설계가 바뀌면 코드와 같은 작업에서 문서도 함께 수정한다.
3. 완료한 항목은 체크하고 검증한 명령이나 수동 테스트를 기록한다.
4. 비밀값, API key, OAuth client secret은 문서에 기록하지 않는다.
5. upstream Excalidraw 문서는 수정하지 않고 개인 기능 문서는 이 디렉터리에만 추가한다.

## 문서 추가 기준

한 문서가 지나치게 커지거나 독립적인 운영 절차가 필요해지면 아래 파일을
추가한다.

```text
personal-cloud-docs/
├── README.md
├── ROADMAP.md
├── DECISIONS.md
├── ENGINEERING_GUARDRAILS.md
├── cloud-storage.md       # Cloud Save 구현 시
├── collaboration.md      # 협업 서버 독립화 시
├── ai-gateway.md          # AI Gateway 구현 시
├── mcp.md                 # MCP 구현 시
└── operations.md          # 배포/백업/복구 절차가 생길 때
```
