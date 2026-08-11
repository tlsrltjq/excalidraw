# Personal Excalidraw Cloud 작업 규칙

이 저장소에서 작업하는 사람과 코딩 에이전트는 변경 전에 다음 문서를 읽는다.

- `personal-cloud-docs/README.md`
- `personal-cloud-docs/ROADMAP.md`
- `personal-cloud-docs/DECISIONS.md`
- `personal-cloud-docs/ENGINEERING_GUARDRAILS.md`

## 작업 절차

1. 현재 milestone과 관련 설계 결정을 확인한다.
2. 구현 전에 완료 조건과 위험을 문서에 반영한다.
3. 변경 범위를 `excalidraw-app`과 개인 디렉터리 안으로 제한한다.
4. 작은 단위로 구현하고 관련 테스트를 추가한다.
5. `node personal-cloud-harness/check-guardrails.mjs`를 실행한다.
6. 변경 범위에 맞는 typecheck, lint, test, build를 실행한다.
7. 결과에 변경 파일, 실행한 검증, 생략한 검증, 남은 위험을 기록한다.

## 변경 경계

- `packages/*`는 upstream core로 간주한다. 공개 API가 부족한 경우가 아니면 수정하지 않는다.
- core 수정이 필요하면 먼저 `DECISIONS.md`에 이유, 대안, upstream 충돌 위험을 기록한다.
- 개인 Cloud 코드는 우선 `excalidraw-app/cloud`, `excalidraw-app/components/cloud`,
  `supabase`, `personal-cloud-harness`에 둔다.
- 기존 collaboration, export, local-first, PWA 동작을 제거하거나 우회하지 않는다.
- upstream 파일의 대규모 rename, formatting, 정리 작업을 기능 변경과 섞지 않는다.
- 새 dependency는 기존 코드나 Web API로 해결할 수 없는 경우에만 추가하고 이유를 기록한다.

## Excalidraw 데이터 규칙

- element와 app state를 직접 변이하지 않는다. 기존 helper와 `updateScene`을 사용한다.
- Cloud 저장에는 `serializeAsJSON(..., "database")`를 사용한다.
- Cloud 로딩에는 `restoreElements`와 `restoreAppState`를 사용한다.
- Excalidraw raw JSON을 임의 schema로 다시 만들거나 필드를 추측하지 않는다.
- scene JSON과 binary file lifecycle을 별도로 처리한다.
- element의 `id`, `version`, `versionNonce`, `index`, binding, file status를 임의로 재작성하지 않는다.
- undo/redo에 포함되는 변경인지 확인하고 적절한 capture/update API를 사용한다.

## 저장과 비동기 규칙

- `onChange` hot path에서 네트워크 요청, 큰 복사, hash 계산을 매 이벤트마다 직접 실행하지 않는다.
- autosave는 debounce만 사용하지 않는다. 문서별 single-flight queue와 revision 검사를 사용한다.
- async load/save 결과를 적용하기 전에 현재 `drawingId`와 operation generation을 다시 확인한다.
- 문서 전환, 초기 scene 적용, 원격 복원 중에는 autosave를 잠근다.
- 실패한 Cloud 저장 때문에 문서별 로컬 초안을 삭제하지 않는다.
- revision 충돌을 자동 덮어쓰기로 해결하지 않는다.
- live collaboration 중 일반 Cloud autosave를 실행하지 않는다.
- React Strict Mode에서 effect가 다시 실행돼도 요청이나 listener가 중복되지 않게 한다.

## 보안 규칙

- `VITE_*`에는 공개 가능한 URL과 publishable key만 둔다.
- service role, DB password, OAuth secret, AI provider key, PAT 원문을 브라우저 코드에 넣지 않는다.
- 모든 사용자 소유 table과 Storage object에는 RLS를 적용하고 다른 계정 테스트를 작성한다.
- 클라이언트가 전달한 `owner_id`, storage path, role을 신뢰하지 않는다.
- AI와 MCP 입력은 schema, 권한, operation allowlist 검증 후 적용한다.
- secret이나 실제 사용자 데이터를 fixture, snapshot, 로그에 기록하지 않는다.

## URL과 호환성 규칙

- URL hash는 기존 share/collaboration 흐름을 위해 예약한다.
- Cloud drawing route가 기존 `?id`, `#json`, `#room`, `#url` 흐름을 깨뜨리지 않게 한다.
- DB migration은 가능한 한 additive하고 이전 프론트 버전과 잠시 공존할 수 있게 한다.
- PWA의 이전 bundle이 새 DB schema에 접근할 수 있다는 점을 고려한다.

## 검증 기준

최소 검증은 변경 위험에 따라 선택한다.

```bash
node personal-cloud-harness/check-guardrails.mjs
yarn test:typecheck
yarn test:code
yarn test:app --watch=false
yarn build
```

저장 로직 변경에는 문서 전환, 느린 응답 순서 역전, offline, revision 충돌 테스트가 필요하다.
파일 로직 변경에는 업로드 실패, 새로고침, 다른 기기 복원 테스트가 필요하다.
협업 변경에는 두 클라이언트 동시 편집과 재연결 테스트가 필요하다.
