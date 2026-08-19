# Supabase Migrations

이 디렉터리는 Personal Excalidraw Cloud가 사용하는 Supabase 프로젝트의 SQL migration을 관리한다. Supabase Auth(로그인)는 `auth.users`를 기본 제공하므로 Milestone 2(로그인)에는 아직 custom table migration이 없다. Milestone 3 (Cloud Workspace, `drawings` table)부터 실제 migration 파일이 추가된다.

## 파일명 규칙

```text
<YYYYMMDDHHMMSS>_<snake_case_description>.sql
```

예: `20260101120000_create_drawings_table.sql`

## 작성 규칙 (`ENGINEERING_GUARDRAILS.md` 12번 참고)

- table 생성과 RLS 활성화(`ENABLE ROW LEVEL SECURITY`), policy 정의를 **같은 migration 파일 안에서** 함께 처리한다. RLS 없는 table을 먼저 만들고 나중에 policy를 추가하는 2단계 migration을 만들지 않는다.
- `owner_id`는 가능하면 `default auth.uid()`로 설정해 클라이언트가 임의사용자 ID를 전달하지 않게 한다.
- child table의 소유권은 `owner_id` 컬럼만 보고 판단하지 않고 parent row의소유권까지 policy에서 확인한다.
- `personal-cloud-harness/check-guardrails.mjs`가 `supabase/migrations/` 아래 파일에서 `CREATE TABLE`은 있는데 RLS 활성화나 `CREATE POLICY`가 없으면경고를 낸다. 경고가 뜨면 같은 migration에서 바로 고친다.
- migration은 가능한 한 additive하게 작성해 이전 프론트 배포와 잠시 공존할수 있게 한다 (`AGENTS.md` URL과 호환성 규칙 참고).
- 비밀값(서비스 role key, DB 비밀번호 등)은 이 디렉터리 어디에도 기록하지않는다. migration SQL은 스키마와 policy만 다룬다.

## 적용 방법

Supabase CLI를 쓰는 경우:

```bash
supabase db push
```

CLI를 아직 설정하지 않았다면 Supabase 프로젝트의 SQL Editor에 파일 내용을그대로 붙여넣어 실행해도 된다. 어느 방법을 쓰든 실행한 migration 파일명과실행 결과를 관련 작업의 커밋 메시지나 `ROADMAP.md`에 기록한다.
