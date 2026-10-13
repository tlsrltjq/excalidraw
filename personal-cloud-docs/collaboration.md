# 자체 공동편집 서버

## 2026-10-13 커밋 및 공개 배포 준비

- 완료 조건: 검토한 서버 구현/lockfile/배포 초안을 기능 브랜치에 커밋·push하고 원격 commit을 확인한다. 앱 문서/하네스도 별도 기능 브랜치에 보관한다.
- 위험: 기능 브랜치 push를 운영 서버 배포로 기록하지 않는다. Render 계정/Free 플랜/공개 접근을 확인하기 전 서비스 생성이나 운영 endpoint 변경은 하지 않는다. Docker 실행은 아직 미검증이며 재연결 직후 빈 화면 관찰은 유지한다.
- 서버 `e2defb15e792f7d801efb71dc8410fceeb10e1a9`를 `origin/codex/personal-room-server`에 push하고 원격 SHA 일치를 확인했다. Docker publish workflow는 master 전용이며 기능 브랜치 push로 실행되지 않는다. GitHub Actions 실행 기록은 조회 당시 없었다.
- 계정 확인: 처음에는 가입 화면이었으나 사용자가 로그인 완료 후 Safari의 Render 대시보드를 확인했다. 서비스 생성/공개 접근은 설정 확인 후 승인받는다.

## Milestone 7 범위

기존 앱의 협업 transport만 개인 excalidraw-room 서버로 전환한다. 기존 암호화/scene reconcile/undo/redo/파일 업로드와 Firebase persistence를 유지한다. 개인 Cloud autosave는 기존대로 협업 중 중지한다.

```text
브라우저 A/B
  -> client-side encryption
  -> 개인 Socket.IO room relay (로컬 localhost:3002)
  -> 상대 브라우저에서 decrypt/reconcile

협업 scene/file 저장 -> 기존 Firebase
개인 그림/폴더 저장 -> 기존 Supabase + RLS
```

서버 저장소는 앱 밖의 `/Users/shingiseop/workspace/personal/excalidraw-room`에 둔다. 별도 repo/lockfile로 upstream 변경과 app 배포를 분리한다. 앱은 기존 `VITE_APP_WS_SERVER_URL`을 사용한다. 운영 URL은 로컬 개발만으로 변경하지 않는다.

## 이번 완료 조건과 위험

### 브라우저 확인 및 공개 배포 준비

- [x] 합성 TEST 방에서 Safari/별도 브라우저 양방향 편집/재연결 확인 (즉시 복구 한계는 아래 참고)
- [x] 서버 실행 dependency 보안 점검 및 업데이트
- [x] 공개 host 설정/health/재배포 가이드와 Render 초안 준비. 실제 서비스는 생성하지 않음

테스트 방은 로컬에서 생성하고 기존 그림을 가져오거나 Cloud 그림에 연결하지 않는다. room key와 참여 URL은 문서/로그에 남기지 않는다. 기존 Firebase 저장이 불가능하면 relay 확인과 persistence 실패를 구분하고 기록한다.

- [x] 공식 서버 fork/clone/upstream 등록. upstream 기준 `03ff435860b508d7cd9e005cfc90f7977ae2a593`.
- [x] relay protocol/room membership/Origin와 실행 범위 확인 및 보완
- [x] loopback 로컬 서버 실행 및 두 실제 Socket.IO 클라이언트 relay/room 격리/재접속 확인
- [x] 기존 앱 협업 회귀 2개 및 relay 하네스 7개 통과. 가드레일은 VALIDATION 최신 기록 참고
- [x] 서버 중지/재기동 및 공개 배포 준비 가이드 작성

## 구현 위치와 연결

- 개인 Fork: https://github.com/tlsrltjq/excalidraw-room
- app branch: `codex/personal-collaboration-server`
- server branch: `codex/personal-room-server`
- 서버 `src/index.ts`: loopback/PORT 설정, `/health`, 정확한 Origin allowlist 및 WebSocket allowRequest, 20자리 hex room ID/단일 canvas 방, 참여자 broadcast 검사, 같은 방 follow 검사, binary/12-byte IV 검증, 종료 처리.
- 서버 `package.json`: `start:local` 추가, 실행/개발 dependency 분리. Express 4.22.3, Socket.IO 4.8.4, debug 4.4.3, TypeScript 5.9.3, adapter 2.5.8/ws 8.21.3 lockfile 반영. app dependency는 변경하지 않았다.
- 서버 `Dockerfile`/`.dockerignore`: Node 24 및 frozen lockfile, container 안의 명시적 HOST/PORT, 환경변수/로컬 artifact 제외. 실제 Docker build/공개 실행은 미검증이다.
- 앱 `personal-cloud-harness/check-room-relay.node-test.mjs`: 실제 클라이언트와 합성 AES-GCM bytes로 relay/격리/재접속/Origin을 확인한다. Node 클라이언트 protocol 검사이며 두 브라우저의 scene/undo/reconcile 검사는 아니다.

기존 앱 `.env.development`의 `VITE_APP_WS_SERVER_URL=http://localhost:3002`를 그대로 사용한다. 운영 `.env.production`은 공식 서버 URL을 유지한다. 새 dependency 이름은 추가하지 않았다. 실행용 audit 0건, 개발 도구 경고는 남아 있다.

## 2026-10-09 후속 결과

Safari와 별도 in-app 브라우저에서 합성 도형/텍스트가 양방향 전달됐고 자신의 undo/redo가 상대 요소를 유지했다. 같은 요소를 동시에 충돌 편집한 검사는 아니다.

서버 재기동 뒤 참여자 2명으로 재연결됐고 새 도형과 기존 요소가 Safari에 반영됐다. 단, 직후 Safari가 잠시 빈 캔버스를 표시했고 상대의 다음 편집 뒤 복구됐다. 무편집 상태의 즉시 복구는 미완료로 남긴다. 모두 퇴장 후 Firebase 복원/이미지 협업 저장은 검사하지 않았다.

서버의 `render.yaml`은 Docker/Free/자동 배포 off, HOST/PORT, `/health`, 운영 Origin을 지정한 초안이다. 실제 서비스 생성/컨테이너 실행/운영 연결은 하지 않았다. 배포/롤백은 operations.md를 따른다.

WebSocket에는 CORS만으로 출처 제한이 적용되지 않으므로 allowRequest를 함께 사용한다. [Socket.IO 공식 문서](https://socket.io/docs/v4/handling-cors). Node/native client는 Origin을 위조할 수 있으므로 이를 사용자 인증으로 간주하지 않는다.

링크 기반 협업은 개인 Cloud 계정 권한과 다르다. room ID를 안다고 Cloud 그림을 읽을 수 있는 모델로 바꾸지 않는다. Origin 제한은 브라우저 출처 검사이며 계정 인증을 대체하지 않는다. 공개 서버의 남용 제한, TLS, WebSocket host 비용, sleep/재연결과 두 브라우저 실기기 동시 편집은 후속으로 남긴다. 방에서 모두 나간 뒤의 복원은 relay가 아닌 persistence 기능이다.
