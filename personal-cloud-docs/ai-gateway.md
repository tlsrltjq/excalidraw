# AI 다이어그램

## 첫 구현 범위

2026-10-17: 운영 배포 검토를 보류하고 무료 로컬 AI로 기능 개발을 우선한다(D-033).

흐름: 입력 prompt → loopback bridge → 설치된 Ollama 생성 모델 → strict Diagram DSL → 기존 Mermaid layout/Excalidraw conversion → 미리보기 → 적용 전 로컬 snapshot → 명시적으로 기존 그림 옆에 추가.

모델은 현재 캔버스/이미지/계정을 받지 않는다. 노드/화살표 생성만 허용하며 파일/링크/HTML/삭제/임의 element 업데이트는 거부한다. 최대 24 노드/40 연결, LR/TD 방향, process/decision/terminal만 지원한다. 모델 응답은 서버와 브라우저에서 모두 검증한다. layout/parser는 기존 라이브러리를 재사용한다.

Apply 전 serializeAsJSON(database) scene과 별도 files snapshot을 IndexedDB에 저장한다. 문서/계정/route/scene 변경·backup 실패에는 적용하지 않는다. 현재 canvas에 추가하고 한 번의 undo로 되돌린다. 마지막 backup 다운로드도 제공한다. 협업·읽기 전용 적용은 MVP에서 제외한다.

설계/위험은 DECISIONS D-033, 실행 방법은 operations, 실제 결과/미확인은 VALIDATION에 기록한다. 유료 API/모델 다운로드/운영 배포는 없다. 기존 그림 AI 수정·대화 이력/Cloud provider/원격 기기 지원은 후속이다.

## 보존과 한계

적용 전 백업은 동일 브라우저 origin의 IndexedDB `personal-ai-recovery/snapshots`에 계정/문서별 마지막 한 개만 보관한다. 이미지 bytes를 포함하며 최대 32 MiB를 넘으면 적용하지 않는다. 백업은 암호화하지 않고 로그아웃 뒤에도 남으며 서버 버전 기록이나 다른 기기 백업이 아니다. 브라우저 저장소 삭제/eviction으로 사라질 수 있다. 다운로드한 `.excalidraw` 파일로 별도 보관할 수 있다.

프롬프트만 모델에 전달하지만 프롬프트 자체에 적은 정보는 모델이 받는다. 설치된 모델의 의미 이해·노드 개수·배치는 정확성을 보장하지 않는다. Safari의 실제 5노드 요청 예시는 4노드로 생성됐다. 사용자가 미리보기를 판단한 뒤 적용해야 한다. 현재 구현은 허용된 로컬 개발 origin 전용이며 운영 HTTPS 앱/다른 기기에서 자동 연결하지 않는다. 노트북/모델/bridge가 실행 중이어야 한다.

참고: https://docs.ollama.com/api/chat , https://docs.ollama.com/capabilities/structured-outputs . Structured schema만으로 신뢰하지 않고 별도 validation을 수행한다.
