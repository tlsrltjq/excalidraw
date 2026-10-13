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

## Supabase 후속 설계 후보

- 기존 Firebase 링크를 자동으로 Supabase에 보내지 않는다. 새 room의 persistence 구분 정보를 hash 외부에 두는 명시적인 route가 필요하다. legacy 기본값은 Firebase다.
- scene/file은 별도 저장한다. DB에는 ciphertext/IV와 원자적 revision, Storage에는 기존 encoder의 암호화된 bytes를 보관한다. Render ephemeral filesystem에 영구 데이터를 저장하지 않는다.
- 서버는 roomKey를 받지 않는다. 클라이언트가 remote ciphertext를 복호화/restore/reconcile하고 expected revision으로 CAS 저장한다. 충돌 시 제한된 재시도, stale room/generation 및 room별 single-flight를 검사한다.
- owner RLS만 재사용하면 익명 링크 참여자의 권한을 표현할 수 없다. 로그인 owner의 room 생성/폐기와 key와 별도의 제한된 join capability 검증 gateway를 후보로 둔다. anon table CRUD나 공개 bucket은 열지 않는다. capability 수명/폐기/읽기·쓰기 scope와 인증 모델은 후속 결정이다.
- 권한 오류/지원되지 않는 provider는 다른 backend에 자동 저장하지 않는다. Firebase fallback은 기존 링크에만 적용한다.
- 후속 검증: 잘못된 key, 다른 room/계정 접근, 만료/폐기 권한, CAS 충돌, 느린 응답, offline, 이미지 업로드 실패/재열기, 모두 퇴장 복원, collaboration undo/reconnect.

## 완료 상태

- [x] CollabPersistence interface와 Firebase adapter
- [x] controller 연결과 집중 회귀 검사 (adapter 8개/협업 2개, typecheck/lint/build/guardrails)
- [ ] Supabase 권한/route/CAS 최종 설계
- [ ] DB/Storage migration과 Supabase adapter
- [ ] encrypted scene/file 실기기 복구 및 운영 전환

첫 두 항목만 이번 범위다. 나머지를 구현/배포 완료로 표시하지 않는다.
