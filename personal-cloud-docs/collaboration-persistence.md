# 협업 저장소 독립

## Milestone 8 첫 구현 단위 (2026-10-13)

완료 조건: 협업 controller의 저장 상태/scene 저장·로드/파일 저장·로드를 `CollabPersistence` 계약으로 모으고 기존 Firebase 구현을 그대로 연결한다. 새 dependency, DB migration, 운영 backend 전환은 없다. 기존 room 링크, client-side encryption, Firestore transaction reconcile, 파일 압축/암호화, save cache 및 오류 전파를 유지한다.

위험: 협업 scene은 개인 Cloud database JSON과 다르다. 현재 Firebase scene은 삭제 요소를 포함한 syncable elements를 암호화한다. 이를 임의로 serializeAsJSON/database scene으로 바꾸지 않는다. FileManager가 기존 encoder로 암호화한 bytes를 adapter에 전달한다. ShareDialog 등의 비협업 Firebase 경로는 이번 변경에서 제외한다.

## 현재 경로

```text
Collab -> CollabPersistence -> Firebase adapter -> 기존 data/firebase
                                   scene: transaction/decrypt/reconcile/encrypt
                                   file: 기존 Storage/encoder
Portal -> 암호화된 실시간 메시지 -> 개인 relay
개인 Cloud autosave -> 협업 중 중지
```

첫 계약은 기존 Portal과 socket cache를 유지해 동작 변경을 피한다. 저장소 선택 경계이며 새 네트워크 큐나 중복 암호화 계층이 아니다. 공개 Collab API의 Firebase 이름은 기존 호출자 호환성을 위해 유지한다.

## 로그인/게스트 및 CAS 구현 단위 (2026-10-13)

사용자는 처음 참여할 때 로그인/게스트를 선택하도록 결정했다. 두 경우 모두 유효한 invite가 필요하다. 계정 선택값을 권한으로 믿지 않고 gateway의 검증 결과만 적용한다. OAuth에는 origin만 전달하고 roomKey가 들어 있는 복귀 경로는 브라우저 안에서만 짧게 보관/정리하는 후속 입장 UI가 필요하다.

새 room ID는 `sc_` + 20 hex, query는 `collabStorage=supabase&invite=<UUID>`, hash는 기존 `#room=id,key` 형식을 유지한다. Firebase 링크는 그대로다. 서버가 sc\_ 방의 단기 입장 ticket을 검증하기 전 새 room을 만들거나 이 route를 운영에 연결하지 않는다. 현재 relay의 거부를 느슨하게 만들지 않는다.

초대 proof는 기존 128-bit room key에서 Web Crypto HKDF(SHA-256, room ID salt, versioned invite UUID info)로 파생한 256-bit bearer credential이다. 길이가 256-bit여도 원본 entropy는 기존 key의 128-bit를 넘는다고 주장하지 않는다. 원본 key를 서버로 보내지 않는다. proof hash를 비교하고 만료/폐기/room/read-write scope를 검증하는 gateway와 별도 DB가 필요하다. 이 helper만으로 권한 검증이 완성된 것은 아니다. 이미 받은 plaintext/key/bytes는 초대 폐기로 회수할 수 없다.

이번 완료 조건: malformed/unknown/중복 route 거부, room/invite/key별 다른 proof 및 canonical key 검증, 실제 AES-GCM/restore/reconcile를 사용하는 scene CAS worker, room별 single-flight, 충돌 재조회(최대 3회), stale operation 차단, 오류 전파. 실제 Supabase 원자성/RLS/Storage 검증은 mock store 결과와 구분한다. 운영 연결/DB 변경은 없다.

참고: [Web Crypto HKDF](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveBits), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security). 새 dependency는 추가하지 않는다.

구현 위치: `collab/persistence/invites.ts`의 route/proof/hash 처리, `sceneWriter.ts`의 암호화 저장 worker. 둘 다 아직 기본 Firebase adapter/입장 화면에서 호출하지 않는 단계다. Store 계약의 첫 CAS 생성 revision은 1이고, 이후 성공은 expected + 1이다. writer는 adapter마다 한 번 생성해야 room별 queue가 유지된다. 가드 함수는 각 await 뒤 현재 room/generation을 확인한다. 이미 서버에 전달된 write 자체를 취소하거나 이미 받은 데이터를 회수하는 보장은 없다.

## Supabase 후속 구현

- 기존 Firebase 링크를 자동으로 Supabase에 보내지 않는다. 새 room의 persistence 구분 정보를 hash 외부에 두는 명시적인 route가 필요하다. legacy 기본값은 Firebase다.
- scene/file은 별도 저장한다. DB에는 ciphertext/IV와 원자적 revision, Storage에는 기존 encoder의 암호화된 bytes를 보관한다. Render ephemeral filesystem에 영구 데이터를 저장하지 않는다.
- 서버는 roomKey를 받지 않는다. 클라이언트가 remote ciphertext를 복호화/restore/reconcile하고 expected revision으로 CAS 저장한다. 충돌 시 제한된 재시도, stale room/generation 및 room별 single-flight를 검사한다.
- owner RLS만 재사용하면 익명 링크 참여자의 권한을 표현할 수 없다. 로그인 owner가 room/초대를 관리하고 로그인/게스트 모두 invite proof를 제출하는 gateway가 필요하다(D-020). anon table CRUD나 공개 bucket은 열지 않는다. expiry/revoke/읽기·쓰기 scope와 relay 입장 ticket은 서버에서 검증해야 하며 아직 미구현이다.
- 권한 오류/지원되지 않는 provider는 다른 backend에 자동 저장하지 않는다. Firebase fallback은 기존 링크에만 적용한다.
- 후속 검증: 잘못된 key, 다른 room/계정 접근, 만료/폐기 권한, CAS 충돌, 느린 응답, offline, 이미지 업로드 실패/재열기, 모두 퇴장 복원, collaboration undo/reconnect.

## 완료 상태

- [x] CollabPersistence interface와 Firebase adapter
- [x] controller 연결과 집중 회귀 검사 (adapter 8개/협업 2개, typecheck/lint/build/guardrails)
- [x] 사용자 결정: 로그인/게스트 선택 지원, client invite route/proof/hash 기반
- [x] 암호화 scene CAS worker/single-flight/stale 결과/충돌·offline 테스트
- [ ] 실제 로그인/게스트 선택 화면과 gateway 입장 처리
- [ ] Supabase 권한/route/CAS 최종 설계
- [ ] DB/Storage migration과 Supabase adapter
- [ ] encrypted scene/file 실기기 복구 및 운영 전환

기본 adapter와 client invite/CAS worker까지 구현했다. 아직 실제 Supabase 권한 검증/저장 기능이나 사용자 입장 선택 화면이 완성된 것은 아니며 운영 전환도 하지 않았다.
