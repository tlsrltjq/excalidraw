# Personal Excalidraw Cloud 아키텍처

이 문서는 개발 흐름과 런타임 구조를 함께 설명한다. 구현이 변경되면 코드와 같은
작업에서 이 문서를 갱신한다.

## 1. 개발 브랜치 흐름

`master`는 공식 저장소와 동일한 상태를 유지하고 개인 기능은 통합 브랜치와 기능
브랜치에서 관리한다.

```mermaid
flowchart LR
    U["upstream/master<br/>공식 Excalidraw"]
    M["master<br/>upstream mirror"]
    F["codex/feat/*<br/>기능별 작업"]
    P["personal-cloud<br/>통합 및 배포 기준"]
    O["origin<br/>개인 Fork"]
    V["Vercel<br/>Production"]

    U -->|fetch / fast-forward| M
    M -->|branch| F
    P -->|branch| F
    F -->|review / merge| P
    P -->|push| O
    O -->|deploy| V
```

초기 `personal-cloud`가 아직 없을 때 만든 기능 브랜치는 `master`에서 시작할 수 있다.
이후에는 `personal-cloud`에서 기능 브랜치를 만들고 완료 후 다시 통합한다.

## 2. 전체 구현 흐름

각 단계는 앞 단계의 데이터 안전성과 운영 기반을 전제로 한다.

```mermaid
flowchart TD
    B["Baseline<br/>실행, 테스트, 빌드"]
    D["Baseline Deploy<br/>Vercel"]
    A["Auth<br/>Supabase session"]
    W["Cloud Workspace<br/>문서 CRUD"]
    L["Local Draft<br/>drawing별 IndexedDB"]
    S["Cloud Save<br/>queue + revision"]
    F["Files<br/>Storage + RLS"]
    Q["MVP QA<br/>다기기 + offline + backup"]
    R["Realtime<br/>자가 host room server"]
    P["Collab Persistence<br/>암호화 저장 독립"]
    AI["AI Gateway<br/>validated operations"]
    LL["Local LLM<br/>localhost bridge"]
    MCP["MCP / Codex<br/>scoped agent access"]

    B --> D --> A --> W --> L --> S --> F --> Q
    Q --> R --> P --> AI --> LL --> MCP
```

## 3. MVP 런타임 아키텍처

MVP는 로그인, 문서 목록, 문서별 로컬 초안, Cloud Save, 이미지 복원과 여러 기기
동기화까지다. 편집기는 기존 Excalidraw를 그대로 사용한다.

```mermaid
flowchart TB
    subgraph CLIENTS["사용자 기기"]
        MAC["Mac Browser"]
        WIN["Windows Browser"]
        PAD["iPad Browser"]
    end

    subgraph WEB["Vercel - Personal Excalidraw"]
        SHELL["Cloud App Shell"]
        DASH["Cloud Workspace"]
        EDITOR["Excalidraw Editor"]
        SAVE["Cloud Save Coordinator"]
        FILES["Cloud File Adapter"]
    end

    subgraph LOCAL["각 브라우저 로컬 저장소"]
        DRAFT["IndexedDB<br/>drawing별 local draft"]
        LOCALFILES["IndexedDB<br/>binary file cache"]
    end

    subgraph SUPABASE["Supabase"]
        AUTH["Auth"]
        DB["PostgreSQL<br/>drawings + revisions"]
        STORAGE["Private Storage<br/>drawing files"]
        RLS["RLS Policies"]
    end

    MAC --> SHELL
    WIN --> SHELL
    PAD --> SHELL

    SHELL --> AUTH
    SHELL --> DASH
    DASH --> EDITOR
    EDITOR --> SAVE
    EDITOR --> FILES

    SAVE <--> DRAFT
    FILES <--> LOCALFILES
    SAVE <--> DB
    FILES <--> STORAGE

    RLS -.-> DB
    RLS -.-> STORAGE
```

### 책임 구분

| 영역 | 책임 | 책임지지 않는 것 |
| --- | --- | --- |
| Excalidraw Editor | scene 편집, history, export | 계정, 문서 목록, DB revision |
| Cloud App Shell | auth/session, 현재 drawing 선택 | element 내부 로직 |
| Cloud Save Coordinator | debounce, queue, revision, 충돌 | binary upload |
| Cloud File Adapter | binary upload/download와 상태 | scene revision |
| Local Draft Store | offline 복구와 미저장 snapshot | 서버의 정본 판정 |
| Supabase | 사용자별 영속 저장과 RLS | 브라우저 secret 보관 |

## 4. 앱 내부 모듈 경계

개인 기능은 우선 `excalidraw-app` 안의 adapter로 격리한다.

```mermaid
flowchart LR
    APP["excalidraw-app/App.tsx"]
    CORE["packages/excalidraw<br/>기존 Editor API"]

    subgraph CLOUD["excalidraw-app/cloud"]
        SESSION["session"]
        DRAWINGS["drawings repository"]
        DRAFTS["draft store"]
        AUTOSAVE["autosave coordinator"]
        FILEADAPTER["file adapter"]
        TYPES["cloud types"]
    end

    subgraph UI["excalidraw-app/components/cloud"]
        AUTHUI["Auth controls"]
        DASHUI["Workspace"]
        STATUSUI["Save status / conflict UI"]
    end

    APP --> CORE
    APP --> UI
    UI --> CLOUD
    CLOUD --> CORE

    SESSION --> DRAWINGS
    DRAWINGS --> AUTOSAVE
    DRAFTS <--> AUTOSAVE
    FILEADAPTER --> AUTOSAVE
    TYPES --- SESSION
    TYPES --- DRAWINGS
    TYPES --- DRAFTS
```

Cloud module이 core의 private 구현을 직접 import하지 않게 한다. 공개 API가 부족하면
먼저 adapter로 해결하고, 그래도 불가능할 때만 core API 확장을 검토한다.

## 5. Cloud Drawing 열기

서버 응답이 늦게 도착해 다른 문서를 덮어쓰지 않도록 drawing ID와 operation generation을
검증한다.

```mermaid
sequenceDiagram
    participant U as User
    participant W as Workspace
    participant C as Cloud Controller
    participant L as Local Draft Store
    participant D as Supabase DB
    participant E as Excalidraw

    U->>W: Drawing A 선택
    W->>C: open(A)
    C->>C: generation 증가, autosave 잠금
    par 로컬 초안 조회
        C->>L: getDraft(A)
        L-->>C: local draft
    and 원격 정본 조회
        C->>D: getDrawing(A)
        D-->>C: scene + revision
    end
    C->>C: 현재 drawing과 generation 재검증
    C->>C: 복구할 snapshot 결정
    C->>E: restoreElements / restoreAppState
    E-->>C: scene 적용 완료
    C->>C: lastSavedHash 설정, autosave 잠금 해제
```

사용자가 A 로딩 중 B를 선택하면 A의 늦은 응답은 버리고 B만 적용한다.

## 6. Autosave와 Revision 충돌

`onChange`는 네트워크를 직접 호출하지 않고 최신 snapshot만 coordinator에 전달한다.

```mermaid
sequenceDiagram
    participant E as Excalidraw onChange
    participant S as Save Coordinator
    participant L as Local Draft Store
    participant D as Supabase DB
    participant U as Conflict UI

    E->>S: snapshot(drawingId, scene)
    S->>L: local draft 즉시 예약 저장
    S->>S: debounce + serialize + hash 비교
    alt 변경 없음
        S->>S: 저장 생략
    else 변경 있음
        S->>S: 문서별 single-flight 확인
        S->>D: UPDATE WHERE revision = expected
        alt 저장 성공
            D-->>S: next revision
            S->>L: synced revision 기록
            S->>S: 후속 snapshot이 있으면 다음 저장
        else revision 충돌
            D-->>S: no row updated
            S->>U: 원격 로드 / 복사본 / 덮어쓰기 선택
        else network 오류
            D--xS: request failed
            S->>L: local draft 유지
            S->>S: offline 또는 error 상태
        end
    end
```

## 7. 파일 저장 흐름

scene과 파일 저장은 별도 상태지만 사용자에게 하나의 저장 상태로 조합해 보여준다.

```mermaid
flowchart LR
    IMG["Image element 추가"]
    CACHE["Local binary cache"]
    UPLOAD["File upload queue"]
    STORAGE["Supabase private Storage"]
    META["drawing_files metadata"]
    SCENE["drawings.scene_data"]
    DONE["전체 저장 완료"]

    IMG --> CACHE --> UPLOAD --> STORAGE --> META
    IMG --> SCENE
    META --> DONE
    SCENE --> DONE
```

파일 업로드가 끝나지 않았으면 scene 저장만 성공해도 전체 상태를 `saved`로 표시하지 않는다.
version history가 참조할 수 있으므로 파일 삭제는 즉시 실행하지 않고 orphan 유예 기간을 둔다.

## 8. 공동편집 확장 구조

MVP에서는 Cloud Save와 Live Collaboration을 분리한다. 자체 Socket 서버를 붙인 뒤
persistence를 별도 단계로 이전한다.

```mermaid
flowchart LR
    A["Client A"]
    B["Client B"]
    ROOM["excalidraw-room<br/>Socket.IO relay"]
    PERSIST["Collab Persistence Adapter"]
    CIPHER["Client-side encryption"]
    DB["Supabase encrypted scene"]
    FS["Supabase encrypted files"]

    A <--> ROOM
    B <--> ROOM
    A --> CIPHER
    B --> CIPHER
    CIPHER --> PERSIST
    PERSIST --> DB
    PERSIST --> FS
```

일반 Cloud Drawing의 revision 저장과 collab room persistence를 자동으로 합치지 않는다.
room 결과를 Cloud Drawing으로 확정하는 소유권과 시점은 별도 설계가 필요하다.

## 9. 최종 목표 아키텍처

AI와 agent는 저장 기반과 version history가 안정된 뒤 추가한다.

```mermaid
flowchart TB
    subgraph DEVICES["Clients"]
        C1["Desktop"]
        C2["Tablet"]
    end

    subgraph APP["Personal Excalidraw"]
        EX["Excalidraw Editor"]
        CW["Cloud Workspace"]
        AIP["AI Assistant"]
    end

    subgraph DATA["Supabase"]
        AU["Auth"]
        DR["Drawings DB"]
        VR["Version DB"]
        ST["File Storage"]
    end

    subgraph REALTIME["Realtime"]
        RM["excalidraw-room"]
        CP["Encrypted Persistence"]
    end

    subgraph AI["AI Gateway"]
        ROUTER["Provider Router"]
        VALIDATOR["Schema + Permission Validator"]
        OPENAI["Cloud Model"]
        OLLAMA["Local LLM Bridge"]
    end

    subgraph AGENT["Agent Integration"]
        API["Scoped Cloud API"]
        MCP["Excalidraw MCP"]
        CODEX["Codex"]
    end

    C1 --> EX
    C2 --> EX
    EX --> CW
    EX --> AIP

    CW --> AU
    CW --> DR
    CW --> VR
    CW --> ST

    EX <--> RM
    RM --> CP
    CP --> DR
    CP --> ST

    AIP --> ROUTER --> VALIDATOR
    VALIDATOR --> OPENAI
    VALIDATOR --> OLLAMA

    CODEX --> MCP --> API
    API --> DR
    API --> VR
    API --> ST
```

## 10. 신뢰 경계

```mermaid
flowchart LR
    BROWSER["Browser<br/>신뢰하지 않는 클라이언트"]
    RLS["Supabase RLS<br/>최종 데이터 권한"]
    SERVER["Server-side API<br/>secret 보관"]
    PROVIDER["AI Provider"]

    BROWSER -->|publishable key + user JWT| RLS
    BROWSER -->|validated request| SERVER
    SERVER -->|provider secret| PROVIDER
```

- 브라우저가 전달하는 `owner_id`, role, storage path를 신뢰하지 않는다.
- publishable key 노출은 정상이며 데이터 보호는 RLS가 담당한다.
- service role과 AI provider key는 server-side에만 둔다.
- AI/MCP operation은 대상 drawing 권한과 element 소속을 다시 검증한다.
