# 실행과 운영 가이드

기준일: 2026-10-03. 현재 저장소의 script/config와 공식 서비스 문서 기준이며 서비스 화면의 메뉴 이름은 변경될 수 있다. 재기동은 데이터 초기화가 아니다.

## 구성과 실행 대상

| 대상 | 실행 위치 | 노트북에서 시작해야 하나? |
| --- | --- | --- |
| 개발 웹 앱 | 노트북 Vite, `http://127.0.0.1:3001/` | 개발할 때만 필요 |
| 운영 웹 앱 | Vercel `personal-excalidraw` | 아니오. 배포된 정적 앱 제공 |
| PostgreSQL, Auth, 이미지 Storage | Supabase `personal-excalidraw` (Seoul) | 아니오. 클라우드 관리형 서비스 |

운영 주소는 `https://personal-excalidraw.vercel.app`. Supabase 프로젝트는 [Dashboard](https://supabase.com/dashboard/project/dtptyzwjhvuvrsguspic)에서 관리한다. 현재 로컬 PostgreSQL/Docker/Supabase 개발 스택은 구성하지 않았다. `supabase start`를 매번 실행할 필요가 없으며 로컬 웹 앱도 클라우드 DB를 사용한다. 따라서 로컬 테스트의 생성/삭제가 운영 데이터에 영향을 줄 수 있으므로 테스트 그림만 조작한다. 노트북을 꺼도 운영 앱/DB는 꺼지지 않는다.

## 노트북에서 다시 시작

1. 터미널을 열고 저장소로 이동한다.

```bash
cd /Users/shingiseop/workspace/personal/excalidraw
git status --short --branch
node --version
yarn --version
```

확인된 도구는 Node `v24.16.0`, Yarn `1.22.22`다. 작업 브랜치와 미커밋 변경을 먼저 확인한다. 명령이 없으면 기존 Node 설치/버전 관리 환경을 복구한 후 Yarn Classic 1.22.22를 준비한다. 이미 준비된 노트북에서는 재설치하지 않는다.

2. 처음 clone했거나 의존성이 바뀐 경우에만 설치한다.

```bash
yarn install --frozen-lockfile
```

3. 저장소 루트의 `.env.local`이 있는지 확인한다. Vite는 `excalidraw-app`이 아니라 루트에서 환경변수를 읽는다. 파일에는 `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`가 필요하다. 값은 Supabase 프로젝트의 공개 URL/publishable key를 사용하며 이 파일은 커밋하지 않는다. service role, DB password, OAuth secret은 넣지 않는다. 값 자체를 터미널 출력이나 문서에 복사하지 않는다.

4. 개발 서버를 시작한다.

```bash
yarn --cwd excalidraw-app start --host 127.0.0.1 --port 3001 --strictPort
```

터미널을 열린 상태로 두고 Safari에서 `http://127.0.0.1:3001/`을 연다. `Local:` 주소가 표시되면 기동된 것이다. `strictPort` 덕분에 충돌 시 다른 포트로 조용히 이동하지 않는다. 로그인 메뉴가 없으면 환경변수 설정을 확인하고 재시작한다. OAuth 계정 인증은 필요할 때 사용자가 진행한다.

5. 다른 터미널에서 응답을 확인할 수 있다.

```bash
curl -I http://127.0.0.1:3001/
```

HTTP 200은 웹서버 응답 확인일 뿐 로그인/DB/이미지 저장 성공을 보장하지 않는다. 로그인 → 내 그림 목록 → 테스트 그림 편집 → 저장 상태 → 새로고침 복원을 별도로 확인한다.

## 정지와 재시작

1. Cloud 문서가 `저장됨`인지 확인하고 미저장 작업은 `.excalidraw`로 내보낸다. 이미지 업로드 실패 시 binary가 원격에 없을 수 있다.
2. 서버를 실행한 터미널에서 `Ctrl+C`를 누른다. Safari 탭을 닫는 것은 서버 정지가 아니다.
3. 위의 개발 서버 시작 명령을 다시 실행하고 Safari를 새로고침한다. `.env.local` 변경은 서버 재시작이 필요하다. 일반 소스 변경은 대개 HMR로 반영된다.

실행 터미널을 잃었거나 포트가 이미 사용 중이면 먼저 소유 프로세스를 확인한다.

```bash
lsof -nP -iTCP:3001 -sTCP:LISTEN
ps -p <확인한_PID> -o pid,ppid,command
```

`<확인한_PID>`는 실제 숫자로 바꾼다. 이 저장소에서 띄운 Vite임을 확인했을 때만 `kill <확인한_PID>`로 정상 종료한다. 모르는 프로세스, DB, 다른 프로젝트를 종료하지 않는다. 강제 종료나 일괄 `killall node`는 기본 절차가 아니다.

다른 앱이 포트를 사용하고 있다면 명령의 `--port`를 3002 등 빈 포트로 바꿀 수 있다. 그 경우 정확한 주소를 열고 OAuth Redirect URL에도 그 개발 origin을 등록해야 한다. `localhost`, `127.0.0.1`, 다른 포트, 운영 도메인은 각각 별도의 origin이다. 로그인/로컬 초안이 공유되지 않으므로 기존 로그인 origin을 유지하는 것이 좋다. localhost로 열려면 `--host localhost`로 기동한다. IPv6 localhost에만 바인딩된 서버는 127.0.0.1에서 접속되지 않을 수 있다.

## Supabase가 응답하지 않을 때

1. 개발 웹 화면은 뜨는데 로그인/목록/저장만 실패하면 웹서버 반복 재시작 대신 네트워크, 브라우저 오류 상태, [Supabase 서비스 상태](https://status.supabase.com/)와 프로젝트 Dashboard 상태를 확인한다.
2. 프로젝트가 `Paused`이면 해당 프로젝트 화면의 `Resume project`(화면에 따라 Restore)를 눌러 확인한다. 복구가 끝난 뒤 앱을 새로고침하고 목록/저장을 다시 확인한다. Free 프로젝트는 비활성 상태에 따라 자동 pause될 수 있으며 복구 가능 기간은 당시 공식 정책을 확인한다. [공식 Pause/Resume 가이드](https://supabase.com/docs/guides/platform/free-project-pausing)
3. 실제 프로젝트 장애로 재시작이 필요한 경우에만 Dashboard → Project Settings → General의 `Restart project`를 사용한다. 이름/ref가 `personal-excalidraw` / `dtptyzwjhvuvrsguspic`인지 확인하고 실행한다. 진행 중 요청이 끊길 수 있으므로 미저장 작업을 export하고 사용자 작업이 없는 시간을 택한다. 완료 상태를 기다린 뒤 로그인/그림 목록/테스트 저장/이미지 복원을 확인한다. 반복해서 Restart를 누르지 않는다. [공식 서비스 상태의 재시작 안내](https://status.supabase.com/)
4. 401은 로그인 세션, 403/permission denied는 grants/RLS, revision conflict는 다른 저장과의 충돌을 우선 조사한다. 재시작으로 접근 정책이나 충돌이 해결되지는 않는다. 아래의 읽기 전용 정책 검증을 이용한다.

DB 재시작을 위해 migration을 다시 실행하거나 `supabase db reset`, DROP TABLE, 프로젝트 삭제를 하지 않는다. 앱 재기동과 DB 초기화는 전혀 다른 작업이다. 이번 가이드 작성 과정에서 운영 DB를 실제 재시작하지 않았다.

## 비로그인 접근 검사 재실행

저장소 루트에서 아래 명령을 실행한다. 현재 Node v24 환경의 `--env-file`로 공개 설정을 읽고 대상 프로젝트 ref를 별도로 지정한다. 다른 프로젝트 URL이나 공개용이 아닌 키면 요청 전에 중단한다.

```bash
node --test personal-cloud-harness/check-anonymous-access.node-test.mjs
node --env-file=.env.local personal-cloud-harness/check-anonymous-access.mjs dtptyzwjhvuvrsguspic
```

이 하네스는 사용자 JWT 없이 세 개인 table에 GET만 전송한다. 각 줄의 `outcome`이 `permission-denied`, HTTP가 401/403일 때만 기대한 결과다. 단순 200 빈 목록, 404, invalid key, 5xx, 통신 실패는 성공으로 처리하지 않고 exit code 1을 반환한다. 실패를 해결하려고 RLS를 끄거나 anon 권한을 추가하지 않는다. project ref/공개 환경변수와 운영 정책 조회 결과부터 점검한다.

응답 본문, scene, key, 인증 토큰은 출력하지 않는다. 비로그인 읽기만 검사하므로 다른 로그인 계정의 그림/파일 접근, Storage 경로 및 쓰기/삭제 권한 검사는 별도로 진행해야 한다.

## DB migration 운영

2026-10-09: `20261009040000_create_workspace_folders.sql`을 기존 프로젝트 SQL Editor에서 적용했다. `folders`, `drawing_folders` 두 테이블을 추가하며 기존 그림 schema/파일은 변경하지 않는다. 적용 전 두 테이블 부재, 적용 성공, authenticated 역할/claims 기반 rollback 검사 6항목 통과를 확인했다. 이미 적용했으므로 이 SQL을 다시 실행하지 않는다. CLI migration 이력 정합성은 아직 별도 작업이다.

내 그림 화면에서 폴더를 생성/변경하고 각 그림의 선택 상자로 이동한다. 새 그림은 미분류에서 시작하며 폴더 삭제는 분류만 해제한다. 제목 검색은 현재 목록과 선택 폴더 안에서 동작한다. 폴더 조회 실패 시 기존 그림 목록은 유지되고 폴더 도구만 비활성화된다. 연결 오류를 확인한 뒤 재시도한다. 이전 프론트는 폴더를 표시하지 않지만 기존 그림을 계속 읽고 저장할 수 있다.

기존 migration은 SQL Editor로 적용한 이력이 있다. Dashboard의 migration tracking이 비어 있어도 실제 테이블이 없는 뜻은 아니다. `supabase/migrations/README.md`와 적용 기록을 먼저 확인하고 현재 schema를 조회한다. 이미 적용된 SQL을 통째로 재실행하면 policy 중복 등으로 실패할 수 있다.

새 변경은 별도 additive migration을 작성하고 RLS/이전 앱 호환성을 검사한다. 대상 프로젝트와 백업/복구 수단을 확인한 뒤 새 migration만 적용하고 파일명/결과를 VALIDATION에 기록한다. 아직 CLI migration 이력을 운영 DB와 맞추지 않았으므로 무심코 `supabase db push`를 실행하지 않는다. CLI 도입은 별도 작업으로 이력 정합성을 먼저 맞춘다.

## Vercel 운영 배포와 재배포

Vercel에는 이 정적 앱의 상시 Node 웹서버를 SSH로 재시작하는 절차가 없다. 코드나 빌드 환경을 바꿨으면 배포/재배포한다.

- 프로젝트: `personal-excalidraw`, Production Branch: `personal-cloud`
- Root Directory: 저장소 루트 `./`
- Build Command: `yarn build`, Output Directory: `excalidraw-app/build`, Install Command: `yarn install`
- 환경변수: 공개 가능한 `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, 기존 빌드 설정 `ENABLE_EXPERIMENTAL_COREPACK=1`

새 코드 배포 순서:

1. 기능 브랜치에서 아래 검증을 통과시키고 변경 파일/검증/위험을 기록한다.
2. 기능 브랜치를 커밋/push하고 Preview의 대상 commit과 앱을 확인한다. Preview 로그인은 해당 origin이 허용돼 있는 경우에만 가능하며 무제한 OAuth wildcard를 추가하지 않는다.
3. 변경을 `personal-cloud`에 병합하고 push하면 Production Branch 설정에 따라 운영 빌드가 시작된다. dirty worktree에서 무작정 브랜치를 전환하거나 운영 브랜치를 덮어쓰지 않는다.
4. Vercel → 프로젝트 → Deployments에서 `Ready`, `Production / Current`, Source 브랜치/commit과 운영 도메인을 확인한다. Preview `Ready`만으로 운영 반영됐다고 판단하지 않는다.
5. 운영 주소에서 로그인/내 그림/저장/이미지 복원을 확인한다. 로컬 `.env.local`은 Vercel에 전달되지 않는다.

같은 commit 재배포는 Deployments에서 대상 배포의 메뉴 → `Redeploy`를 사용한다. 환경변수 변경 후에는 해당 환경으로 새 빌드가 필요하다. 문제가 있는 배포는 이전 정상 배포로 rollback을 검토하되 DB migration은 함께 되돌려지지 않으므로 이전 프론트 호환성을 확인한다. [공식 배포 관리 가이드](https://vercel.com/docs/deployments/managing-deployments)

## 코드 검증과 빌드 미리보기

저장 로직 등 위험이 큰 변경의 기본 검증:

개발 서버를 켠 상태에서 production build를 동시에 실행하면 Vite의 ESLint 감시기가 교체 중인 `build/assets` 파일을 읽다가 `ENOENT`로 종료될 수 있다 (2026-10-03 실제 관찰). 먼저 개발 서버 터미널에서 `Ctrl+C` → 아래 검증/빌드 완료 → 개발 서버 재시작 순서를 따른다. 해당 오류만으로 DB 장애라고 판단하지 않는다.

```bash
node personal-cloud-harness/check-guardrails.mjs
yarn test:typecheck
yarn test:code
yarn test:app --watch=false
yarn build
```

빌드 산출물은 `excalidraw-app/build/`다. 운영 빌드의 로컬 미리보기는 다음과 같다.

```bash
yarn --cwd excalidraw-app vite preview --host 127.0.0.1 --port 5000 --strictPort
```

터미널의 주소(`http://127.0.0.1:5000/`)를 열고 종료할 때 `Ctrl+C`를 누른다. 이 origin은 3001 로그인 상태를 공유하지 않으며 OAuth 테스트에는 별도 Redirect URL 설정이 필요하다. 이 명령은 이미 빌드한 결과를 제공할 뿐 소스 변경을 자동 빌드하지 않는다.

## 증상별 첫 확인

### 미저장 이미지 복구

이미지 업로드가 실패하면 동일 브라우저/origin의 문서별 IndexedDB 초안을 보존한다. 그림을 다시 열어 초안 안내가 나오면 `로컬 변경 사용`으로 이미지까지 복원하고 연결이 정상일 때 재업로드한다. 서버 버전 사용은 로컬 초안을 버리는 명시적 선택이므로 미저장 작업이 필요하면 먼저 파일로 내보낸다. 다른 origin/기기에서는 이 초안이 보이지 않는다.

2026-10-04 Safari 검사에서 복구 후 새로고침의 빈 캔버스가 재현됐고, 2026-10-09 로컬에서 초기화 경합을 수정·재검증했다. 운영 반영은 별도다. 같은 URL이어도 빈 화면을 서버의 빈 그림으로 단정하지 않는다. 미저장 작업이 있다면 먼저 파일로 내보내고 `내 그림`에서 해당 그림을 다시 연다. 빈 화면을 새 그림/덮어쓰기로 저장하거나 사이트 데이터를 삭제하는 것은 복구 방법이 아니다. 상세 재현/수정 기록은 VALIDATION을 따른다.

`로컬 복구 저장에 실패했습니다` 안내는 브라우저 저장소 차단/공간 부족 등으로 안전한 로컬 복구본을 만들지 못했다는 뜻이다. 미저장 캔버스를 즉시 `.excalidraw`로 내보내고 공간/권한을 확인한 뒤 저장 재시도를 누른다. 브라우저 사이트 데이터 삭제는 복구 절차가 아니며 남아 있는 초안까지 지운다. 쓰기 또는 업로드 중 종료 경고가 뜨면 작업 완료까지 기다린다. 강제 종료 전에 끝나지 않은 IndexedDB transaction은 복구를 보장할 수 없다.

| 증상 | 먼저 확인할 것 |
| --- | --- |
| 개발 주소 연결 실패 | Vite 터미널, 실제 host/port, lsof |
| 로그인 메뉴 없음 | 루트 `.env.local`의 공개 env 설정, 서버 재시작 |
| OAuth가 운영 주소로 돌아감 | Supabase Authentication → URL Configuration의 개발 origin 허용 |
| 로그인 후 목록/저장 오류 | 세션, Supabase 상태, grants/RLS; 테이블 삭제 금지 |
| 이미지 업로드 실패 | 연결, Storage 정책/용량, metadata 권한; scene 저장만으로 완료 아님 |
| 로컬 수정이 운영에 없음 | 커밋/push/병합 여부, Vercel Source commit와 env |
| 새 배포 후 오래된 화면 | Source commit 확인, export 후 새로고침/PWA 업데이트 확인; 초안 삭제 금지 |

운영 장애 기록에는 시간, 환경/주소, 브랜치/commit, 재현 절차, 오류 종류, 조치와 검증 결과를 남긴다. JWT, key, 실제 scene 본문은 기록하지 않는다.

## 그림 파일 백업과 복원

### 전체 캔버스 백업

1. 대상 Cloud 그림을 열고 모든 이미지가 실제로 표시되는지 확인한다. 로딩/깨진 이미지가 남아 있으면 완전한 백업으로 간주하지 않는다. 업로드 실패 상태라도 현재 캔버스에 이미지 bytes가 있으면 파일 백업은 가능하다.
2. 메뉴의 디스크 저장 기능으로 `.excalidraw` 파일을 내려받는다. 날짜와 그림 이름을 붙여 별도 보관한다. JSON 내부를 직접 수정하지 않는다.
3. PNG/SVG는 공유용 출력이다. 편집 가능한 복구본으로도 쓰려면 이미지 내보내기에서 `편집 데이터 포함`을 켠다. 선택한 요소만 내보내면 전체 그림 백업이 아니므로 선택 영역 옵션을 확인한다.
4. 백업은 한 그림의 현재 element/app state와 참조 이미지 bytes를 담는다. Cloud drawing ID, 소유권, 버전 기록, 다른 그림 목록, undo 전체 이력은 담지 않는다. database scene JSON만 보관하면 이미지 bytes는 빠진다.

현재 한국어 Safari UI에서 편집 데이터 포함 옵션은 `화면을 담기`로 표시된다. 이를 켜면 이미지 파일이 `<이름>.excalidraw.png` 또는 `<이름>.excalidraw.svg`로 저장된다. 이 확장자는 오류가 아니라 편집용 scene이 포함된 파일임을 나타낸다.

### 원본을 건드리지 않는 복원 검사

1. 원본 Cloud 그림이 열린 탭에서는 파일을 가져오지 않는다. 파일 가져오기가 현재 캔버스를 바꾸면 연결된 그림에 autosave될 수 있다.
2. 별도 Safari 개인정보 보호 창에서 앱을 열고 로그인하지 않은 상태인지 확인한다. 주소의 `?drawing=...`를 제거하고 `http://127.0.0.1:3001/` 또는 운영 앱 루트로 접속한다. 일반 탭에서 로그아웃하면 다른 탭의 로그인도 바뀔 수 있으므로 별도 개인정보 보호 세션을 권장한다.
3. 메뉴의 열기로 `.excalidraw` 또는 편집 데이터 포함 PNG/SVG를 가져온다. 도형/이미지/배경을 확인하고 이미지를 선택해 편집 가능한지 확인한다. 일반 PNG/SVG는 그림 한 장을 삽입할 수 있지만 원래 개별 element를 복원하지 못한다.
4. Cloud에 올릴 필요가 있으면 검사한 별도 창에서 로그인한 뒤 `내 그림 → 현재 캔버스를 새 그림으로 저장`을 사용한다. 복원본에 새 이름을 붙이고 업로드 완료를 확인한다. 원본 drawing ID를 URL에 넣어 덮어쓰지 않는다.
5. 원본과 복원본의 이미지를 비교하고 새로고침 후 재복원까지 확인한다. 이 단계는 실제 로그인/다운로드/파일 열기 검증이며 자동 serializer 테스트만으로 완료됐다고 표시하지 않는다.

현재 계정의 모든 그림과 버전 기록을 일괄 백업/복구하는 기능은 없다. 필요한 그림마다 파일을 저장한다. 백업 파일에는 실제 그림/이미지 내용이 있으므로 공개 저장소에 커밋하거나 테스트 fixture로 사용하지 않는다.

## 실제 접근 정책 확인

저장소의 migration과 운영 DB의 현재 설정은 별도로 확인한다. `personal-cloud-harness/inspect-cloud-access.sql`을 운영 Supabase SQL Editor에서 실행한다. 이 쿼리는 설정 metadata만 조회하며 scene, 파일 내용, 계정 정보, 비밀값을 읽거나 변경하지 않는다.

판정 기준:

- `table_rls`: `public.drawings`, `public.drawing_files`, `public.drawing_revisions`, `storage.objects` 네 항목이 존재하고 `rls_enabled`가 모두 `true`다.
- `policy`: `drawings`의 읽기/생성/수정/삭제는 `auth.uid() = owner_id`로 제한된다. INSERT/UPDATE의 `with_check`도 소유자 변경을 막는다.
- `drawing_files`의 INSERT/UPDATE는 소유자 검사와 parent drawing 소유권 검사를 함께 한다. `drawing_revisions`에는 사용자 소유 SELECT 정책만 있다.
- Storage의 해당 정책은 `bucket_id = 'drawing-files'` 및 경로 첫 segment의 사용자 소유권을 검사한다. 다른 permissive 정책이 이를 우회하도록 허용하는지 전체 `storage.objects` 정책을 함께 검토한다.
- `table_privileges`: `authenticated`는 drawings/drawing_files CRUD가 가능하고 drawing_revisions에는 SELECT만 가능하다. `anon`에는 개인 table 접근을 허용하지 않는다.
- `bucket`: `drawing-files`가 존재하고 `public`은 `false`다.
- `trigger`: drawings의 timestamp 및 snapshot trigger가 활성화돼 있다. snapshot 함수의 `security_definer`가 `true`이고 `search_path`가 고정돼 있다.

쿼리 결과가 기준과 다르면 해당 항목을 검증 기록에 남긴다. 정책 수만 보고 통과시키지 않는다. SQL Editor는 관리자 권한이므로 실제 다른 계정의 요청 차단을 대신하지 않는다. 두 계정의 table/Storage 접근 테스트는 별도로 수행한다.

## 테스트 데이터 정리

테스트 drawing은 생성 당시의 ID로 추적한다. 삭제 후 `내 그림`에서 사라지고, 해당 URL을 새로 열었을 때 찾을 수 없음/접근 불가 안내가 나오는지 확인한다. Storage binary의 orphan 정리는 이 절차에 포함하지 않는다. 해당 보존 정책은 DECISIONS.md D-011을 따른다.

## DB 권한 Rollback 검사 (2026-10-09)

`personal-cloud-harness/check-rls-isolation.sql`은 migration이 아닌 수동 검증 하네스다. 운영 설정을 바꾸거나 RLS를 끄지 않는다.

1. Safari에서 Supabase의 personal-excalidraw 프로젝트(ref `dtptyzwjhvuvrsguspic`) SQL Editor를 연다. 다른 프로젝트에서 실행하지 않는다.
2. 신규 private query에 파일 **전체**를 넣고 실행한다. 일부 선택 실행, 끝의 `rollback` 제거, `commit` 추가는 금지한다.
3. 대상은 ID와 제목 모두 일치하는 `TEST 2026-10-04 backup-restore` 한 개다. 없으면 중단하며 실제 사용자 그림으로 대체하지 않는다. 테스트 중 같은 그림을 편집하지 않는다.
4. 13개의 `passed`가 모두 true인지 확인한다. 소유자 읽기 positive control까지 true여야 격리 검사가 유효하다. 오류/false/null은 통과가 아니다. 예상치 못한 오류 시 별도로 `rollback;`을 실행하고 원인을 확인한다.
5. 원본 그림의 제목/수정 시각과 probe 미존재를 읽기 전용으로 확인한다. 실제 binary Storage 삭제 API는 사용하지 않는다.

전체 transaction과 각 mutation의 subtransaction이 쓰기를 취소한다. 테스트 claims/임시 table/grant는 해당 transaction 안에서만 쓰고 영구 권한은 바꾸지 않는다. 결과는 이름/boolean뿐이며 scene, owner UUID, credential은 출력하지 않는다. SQL Editor는 쿼리 본문을 자동 저장할 수 있다.

검사 범위는 DB 역할/임시 claims의 RLS다. 실제 사용자 JWT 유효성, Storage HTTP 다운로드/업로드/삭제, 파일 metadata 쓰기와 owner 변경은 따로 확인해야 한다. 2026-10-09 실행 결과 13항목 및 후속 보존 4항목 통과. 다른 계정 로그인은 Safari 개인정보 보호 창에서 수행하며 암호/토큰을 채팅으로 전달하지 않는다.

## 실제 두 계정 Storage 읽기 대조

일반 창과 Safari 개인정보 보호 창에서 같은 로컬 origin에 서로 다른 계정으로 로그인한다. 기존 앱의 Supabase client를 사용하고 인증값을 복사하지 않는다.

1. 소유자 창에서 TEST drawing의 drawing_files 경로 한 건만 조회한다. 같은 경로의 Storage SDK download가 성공하고 bytes가 비어 있지 않아야 한다.
2. 다른 창의 로그인 사용자가 해당 파일 소유자와 다르다는 boolean만 확인한다. 같은 bucket/path를 download하고, 오류/data 없음인지 확인한다. binary/이메일/credential을 로그에 남기지 않는다.
3. 다른 계정에서 해당 drawing_files ID 조회가 오류 없이 0행인지 확인한다. 통신 오류나 없는 파일 실패만으로 RLS 통과를 판정하지 않는다.
4. 검사기를 닫고 원본/로그인/설정을 유지한다. 쓰기/삭제 요청은 이 읽기 절차에 포함하지 않는다. 실제 사용자 파일이 아니라 기존 TEST 파일만 사용한다.

2026-10-09 결과: 소유자 nonempty 성공, 다른 계정 data 없음 및 SDK status 400/statusCode 404/NoSuchKey, metadata 0행. 같은 경로의 소유자 성공이 있어 파일 미존재와 구분했다. 403이 아니어도 Storage 서비스가 다른 사용자의 object 존재를 숨길 수 있다. 이 읽기 결과는 Storage/metadata 쓰기 정책과 서명 URL 검사를 대체하지 않는다.

## 파일 쓰기 권한 검사

DB metadata 검사는 `personal-cloud-harness/check-file-write-isolation.sql` 전체를 대상 프로젝트의 관리자 SQL Editor에서 실행한다. TEST 복원본/파일과 다른 실제 사용자가 있어야 한다. 없으면 중단하고 실제 사용자 그림으로 대체하지 않는다. 전체 선택 실행/끝의 rollback 유지/오류 시 rollback 규칙은 위 DB 검사와 같다.

13항목 모두 true여야 한다. 소유자 정상 CRUD는 각 1행, 다른 사용자 수정/삭제는 0행, owner/parent 위조와 변경은 42501이어야 한다. 실제 foreign parent는 transaction 안에서만 생성하고 각 쓰기도 취소한다. 원 metadata JSON 비교 결과가 true인지 확인한다. 결과를 실제 두 JWT의 HTTP 검사로 해석하지 않는다.

Storage HTTP 쓰기는 기존 이미지로 검사하지 않는다. 별도 2×2 합성 PNG를 신규 TEST 경로에 만들고 scene/버전/metadata에 연결하지 않는다. 소유자 정상 생성/덮어쓰기와 다른 계정 생성/덮어쓰기 거부를 비교한다. 거부된 새 경로가 정말 없는지, 대조 PNG bytes가 그대로인지 소유자의 읽기로 확인한다. JWT/이미지 본문은 로그에 출력하지 않는다.

실제 삭제 검사/최종 정리는 해당 TEST 파일의 영구 삭제 확인을 받은 뒤에만 진행한다. 다른 계정 remove의 성공 응답만으로 거부를 판정하지 않는다(0행 삭제도 성공할 수 있다). 소유자가 파일을 여전히 읽을 수 있는지 대조하고, 소유자 삭제 후 실제 부재를 확인한다. 원본/버전에서 참조하는 파일은 지우지 않는다.

2026-10-09 삭제 비교/정리 완료: 다른 계정 remove 0개, 소유자 remove 1개, 소유자 목록에서 파일 부재. 일반 download는 캐시 bytes를 반환했으므로 최종 확인에는 아래 기존 SDK 옵션으로 캐시를 우회했다.

```ts
supabase.storage
  .from("drawing-files")
  .download(
    testPath,
    { cacheNonce: crypto.randomUUID() },
    { cache: "no-store" },
  );
```

캐시 우회 요청에서 data 없음과 404/NoSuchKey를 확인했다. 서버 삭제가 이미 수신한 bytes나 브라우저 캐시까지 없애지는 않는다. 권한/삭제 여부 검증에 캐시된 성공 응답만 사용하지 않는다. 원본 제목/수정 시각/이미지 보존 및 임시 검사 context 제거도 확인했다. 합성 PNG는 더 이상 남아 있지 않다.
