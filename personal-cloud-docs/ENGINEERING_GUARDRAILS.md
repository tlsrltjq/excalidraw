# 엔지니어링 가드레일

이 문서는 구현 중 자주 발생할 수 있는 소스 코드와 로직 오류를 설명한다.
강제 가능한 일부 규칙은 `personal-cloud-harness/check-guardrails.mjs`가 검사한다.

## 1. Upstream 경계

`packages/*`는 npm으로 배포되는 Excalidraw core다. 개인 Cloud 기능 때문에 core를
수정하면 upstream merge와 라이브러리 동작에 영향을 준다.

우선순위:

```text
기존 공개 API 사용
  -> excalidraw-app adapter/hook
  -> 작은 공개 API 확장
  -> 마지막 수단으로 core 로직 변경
```

core 수정이 불가피하면 `DECISIONS.md`에 기록하고 아래처럼 명시적으로 검사 예외를
허용한다.

```bash
PERSONAL_CLOUD_ALLOW_CORE_CHANGES=1 node personal-cloud-harness/check-guardrails.mjs
```

예외는 검사를 통과시키는 수단일 뿐이며 설계 기록과 core 회귀 테스트를 대체하지 않는다.

## 2. Scene 복원과 저장

Cloud scene은 Excalidraw 내부 객체를 임의로 `JSON.stringify`해서 저장하지 않는다.

- 저장: `serializeAsJSON(elements, appState, files, "database")`
- 복원: `restoreElements`, `restoreAppState`
- 파일: scene JSON과 별도 저장 후 `addFiles`로 복원

database serializer는 transient app state와 binary file을 제외한다. 따라서 파일을
별도로 저장하지 않으면 이미지 element만 남고 실제 이미지는 사라진다.

## 3. Element 불변성과 History

Excalidraw element는 immutable data처럼 다룬다. 직접 property를 수정하면 memoization,
binding, scene version, collaboration reconciliation이 어긋날 수 있다.

- 기존 element helper를 사용한다.
- 여러 element 변경은 하나의 논리적 operation으로 묶는다.
- 사용자 작업인지 원격 복원인지에 따라 history capture 여부를 구분한다.
- AI preview는 실제 scene과 분리하고 적용 시점에만 history에 기록한다.

## 4. `onChange` Hot Path

`onChange`는 선택, 이동, 입력 등으로 매우 자주 호출된다. 여기에서 다음 작업을 직접
수행하지 않는다.

- Supabase UPDATE
- binary 변환이나 업로드
- 전체 scene deep clone
- 매 호출 crypto hash 계산
- React state의 불필요한 연쇄 갱신

콜백에서는 최신 snapshot을 저장 큐에 전달하고, 직렬화와 네트워크 작업은 debounce된
worker가 처리한다. 직렬화 결과가 마지막 저장 hash와 같으면 요청하지 않는다.

## 5. 비동기 순서 역전

그림 A 로딩 중 B로 이동했는데 A의 응답이 늦게 도착할 수 있다. 저장 요청도 최신 요청이
먼저 끝날 수 있다.

모든 load/save operation은 다음을 가져야 한다.

```text
drawingId
operation generation 또는 AbortSignal
expected revision
```

응답 적용 직전에 현재 drawing과 generation을 비교한다. autosave는 문서당 하나만 실행하고
실행 중 발생한 최신 snapshot은 다음 요청으로 합친다.

## 6. 초기화와 Autosave 잠금

원격 scene을 `updateScene`으로 적용하면 `onChange`가 발생할 수 있다. 다음 구간에는 저장
잠금이 필요하다.

- 앱 초기 scene 복원
- Cloud drawing 전환
- 충돌 후 원격 버전 복원
- version history 복원
- collaboration 시작과 종료 전환

잠금은 `try/finally`로 해제하고 중첩 호출을 고려해 boolean보다 reference count나 기존
Locker 패턴을 사용한다.

## 7. Revision 충돌

`updated_at` 비교만으로 동시 저장을 막지 않는다. DB의 조건부 update나 RPC에서 revision을
원자적으로 증가시킨다.

```text
UPDATE ... WHERE id = drawingId AND revision = expectedRevision
```

영향받은 행이 없으면 충돌이다. 충돌 시 자동 재시도하며 덮어쓰지 않고 원격 로드,
로컬 복사본 저장, 명시적 덮어쓰기 중 하나를 사용자가 선택하게 한다.

## 8. 로컬 초안 수명

Cloud 저장 성공 응답을 받고 revision을 반영하기 전에는 로컬 초안을 삭제하지 않는다.
실패한 저장, 브라우저 종료, OAuth redirect, offline에서도 초안이 남아야 한다.

서버 scene, 마지막 동기화 scene, 현재 local draft를 구분한다. 하나의 전역 localStorage
scene을 Cloud 문서 여러 개의 복구 저장소로 사용하지 않는다.

## 9. 이미지 Lifecycle

scene 저장 성공과 파일 업로드 성공은 별도 상태다. scene에서 파일을 참조하기 전에 파일이
영구 저장됐는지 추적하고 부분 실패를 복구할 수 있어야 한다.

- `FileId`와 BinaryFileData metadata를 보존한다.
- private bucket과 owner/drawing 경로 RLS를 적용한다.
- upload가 끝나지 않은 상태에서 `saved`로 표시하지 않는다.
- 삭제 즉시 binary를 지우지 않고 다른 version의 참조 여부를 확인한다.
- orphan cleanup은 유예 기간을 둔 별도 작업으로 수행한다.

## 10. React와 상태 관리

- 기존 Jotai와 app adapter 패턴을 우선 사용한다.
- render 중 Supabase client나 Promise를 반복 생성하지 않는다.
- effect listener와 subscription은 cleanup한다.
- React Strict Mode의 mount/unmount 재실행에도 idempotent해야 한다.
- auth state와 drawing state를 하나의 거대한 context에 넣지 않는다.

## 11. Collaboration 경계

Cloud Save와 collaboration persistence는 다른 데이터 흐름이다. MVP에서는 협업 중 일반
Cloud autosave를 끈다. Firebase를 교체할 때는 transaction 안의 reconcile과 client-side
encryption 동작을 보존해야 한다.

Socket 서버만 교체해도 scene/file persistence는 Firebase에 남을 수 있다. transport와
persistence의 독립 여부를 각각 검증한다.

## 12. DB와 RLS

- `owner_id`는 가능한 한 `auth.uid()`에서 정한다.
- RLS는 직접 table 접근과 Storage object 접근을 모두 검사한다.
- child row의 `owner_id`만 믿지 않고 parent drawing 소유권을 확인한다.
- migration은 table 생성과 RLS 활성화/policy를 가능한 한 같은 변경에 포함한다.
- delete cascade와 version/file 보존 정책이 충돌하지 않는지 확인한다.
- 다른 사용자 JWT로 실패하는 통합 테스트를 작성한다.

## 13. 에러와 관찰 가능성

저장 실패를 console에만 남기지 않는다. 사용자에게 상태를 보여주되 secret, scene 본문,
binary data는 로그에 남기지 않는다. 재시도 가능한 오류와 인증/충돌/용량 오류를 구분한다.

## 14. AI와 MCP

- LLM output은 신뢰하지 않는다.
- raw element 전체 교체보다 operation allowlist를 사용한다.
- schema와 drawing 권한을 서버와 클라이언트 경계에서 검증한다.
- delete/update 대상 ID가 현재 drawing에 속하는지 확인한다.
- apply 전에 version snapshot을 만들고 Preview를 제공한다.
- MCP에는 Supabase service role을 전달하지 않고 scope가 제한된 PAT를 사용한다.
