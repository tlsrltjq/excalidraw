# 자체 공동편집 서버

## 2026-10-14 relay admission 구현

서버 기능 브랜치 `codex/collab-relay-admission`에 새 sc_ room의 공개 키 입장 검증/socket challenge/갱신/만료 종료와 read/write 송수신·follow 제한을 구현했다. legacy hex room은 유지한다. 앱의 `check-room-admission.node-test.mjs`가 별도 loopback 임시 포트로 이 빌드의 서버를 시작하고 합성 키/클라이언트만 사용한 뒤 종료한다. 상세 프로토콜은 collaboration-persistence의 D-026 기록을 따른다. 공개 Render 서버는 기존 `e2defb1`을 유지하며 push는 배포가 아니다.

최신 판정: 2026-10-13 운영 프론트 Source `d86d9e27`로 개인 relay 연결 완료. local/production build와 공개 endpoint 반영 확인. 운영 화면 자동 접근과 실제 sleep 뒤 브라우저 복구는 미검증이다. 아래 준비 당시 '미전환' 기록은 이 결과로 후속 처리한다.

## 2026-10-13 공개 서버 앱 연결 계획

- 완료 조건: 공개 relay를 연결한 별도 localhost:3003 테스트 앱에서 합성 TEST 두 브라우저 편집/새로고침 재참여를 확인한다. 운영 endpoint 변경은 해당 검사 후 시행하고 실제 빌드 Source/연결 대상까지 확인한다.
- 위험/경계: 테스트 전 정확한 임시 Origin 추가 승인을 받고 종료 후 제거한다. wildcard, 결제, DB 변경, 실제 Cloud 그림 사용은 하지 않는다. Firebase persistence/Cloud autosave 잠금은 그대로 유지한다. 15분 sleep 이후 cold start는 실제 대기 검사와 일반 reconnect 결과를 구분한다.
- 로컬 개발 기본 relay는 유지하고 실행 환경변수만 공개 주소로 덮어쓴다. 테스트 화면이 운영 반영된 것으로 기록하지 않는다. 운영 `.env.production` 및 Vercel 별도 override를 확인한 후 최소 변경한다.

브라우저 결과: Safari/별도 브라우저에서 합성 도형과 텍스트 양방향 전달 및 한쪽 새로고침 뒤 두 요소 복구를 확인했다. 테스트 세션은 종료했고 해당 별도 origin에 합성 결과만 보존했다. 임시 Origin 제거 재배포를 실행했다. 관련 협업 회귀 2개/build/가드레일 통과. 로컬 production bundle에는 개인 relay URL이 있고 이전 공식 relay URL은 없다. 실제 15분 sleep 뒤 복구는 미검증이다. 운영 Git 배포 Source와 공개 bundle 확인은 다음 판정이다.

운영 결과: Preview success 후 personal-cloud를 fast-forward/push했다. GitHub Production deployment Source `d86d9e270b0933db969e008d487ac05e960280b7`, 운영 version `2026-10-13T12:37:31Z-d86d9e2`, 실제 module bundle에 개인 relay 포함/공식 relay 없음 확인. 이후 운영 자동 브라우저 접근이 사용자 저장 설정으로 거부돼 다른 표면으로 우회하지 않았다. 테스트 Origin 제거 중 입력 값에 잔여 문자가 남아 한 번 시작 검증이 실패했으나 정확한 문자열 교체 뒤 Render Live 확인, 운영 Origin 접속 positive control 및 localhost:3003 거부 확인으로 해결했다.

## 2026-10-13 커밋 및 공개 배포 준비

- 완료 조건: 검토한 서버 구현/lockfile/배포 초안을 기능 브랜치에 커밋·push하고 원격 commit을 확인한다. 앱 문서/하네스도 별도 기능 브랜치에 보관한다.
- 위험: 기능 브랜치 push를 운영 서버 배포로 기록하지 않는다. Render 계정/Free 플랜/공개 접근을 확인하기 전 서비스 생성이나 운영 endpoint 변경은 하지 않는다. Docker 실행은 아직 미검증이며 재연결 직후 빈 화면 관찰은 유지한다.
- 서버 `e2defb15e792f7d801efb71dc8410fceeb10e1a9`를 `origin/codex/personal-room-server`에 push하고 원격 SHA 일치를 확인했다. Docker publish workflow는 master 전용이며 기능 브랜치 push로 실행되지 않는다. GitHub Actions 실행 기록은 조회 당시 없었다.
- 계정 확인: 처음에는 가입 화면이었으나 사용자가 로그인 완료 후 Safari의 Render 대시보드를 확인했다. 서비스 생성/공개 접근은 설정 확인 후 승인받는다.
- 앱 기록/하네스도 `c9506cca`로 커밋/push했다. 운영 통합 브랜치는 변경하지 않았다.
- 무료 전용 제약: 사용자 요청으로 Free만 사용하고 카드 등록/유료 전환/결제 요청 시 중단한다. Safari에서 Hobby, No card on file, build pipeline 추가 지출 한도 $0 확인. 현재 새 서비스 입력은 공개 저장소, `codex/personal-room-server`, Docker, Free, Oregon, 자동 배포 Off, `/health` 및 네 환경변수로 준비했다. Deploy는 공개 접근 승인 전 누르지 않는다.

## Milestone 7 범위

### 무료 공개 배포 실행 (2026-10-13)

사용자가 Free 공개 서비스 생성을 승인했다. 배포 Source `e2defb1`, Docker/Free/자동 배포 Off/`/health`를 확인한 뒤 생성 버튼을 실행했다. 완료 조건은 실제 서비스 상태/Source/HTTPS health 확인이며 운영 프론트 endpoint 전환은 별도다. 무료 계정 화면에는 월 750시간/5GB 전송량/500분 빌드, 현재 모두 0 사용으로 표시됐다. 카드 없음/추가 빌드 지출 한도 $0을 유지한다. 15분 무통신 sleep과 cold start 지연, 공유 workspace 한도, 암호문 relay의 공개 남용 가능성은 남는다. 한도 초과나 결제 요구를 유료 전환으로 해결하지 않는다.

결과: Render Docker build/배포 성공, Live 및 Source 전체 SHA 일치 확인. 주소 `https://personal-excalidraw-room.onrender.com`, `/health`는 HTTP 성공과 `{"status":"ok"}` 반환. 실제 두 Node Socket.IO 클라이언트의 TLS WebSocket/같은 방 AES-GCM bytes 전달/재접속 후 재전달/외부 Origin 거부 확인. 합성 방과 key는 기록하지 않고 모든 probe 연결을 종료했다. 공개 브라우저 편집/실제 sleep 뒤 복구는 미검증이며 운영 프론트 연결은 바꾸지 않았다. 이전의 Docker 미검증 기록은 당시 로컬 daemon에 관한 것이며 이번 Render container 실행 성공과 구분한다.

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
