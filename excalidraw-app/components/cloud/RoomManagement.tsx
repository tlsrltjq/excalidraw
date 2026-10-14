import { Dialog } from "@excalidraw/excalidraw/components/Dialog";
import { copyIcon, PlusIcon } from "@excalidraw/excalidraw/components/icons";
import { useEffect, useRef, useState } from "react";

import { atom, appJotaiStore, useAtom } from "../../app-jotai";
import { cloudSessionAtom, useCloudSession } from "../../cloud/session";
import { supabase } from "../../cloud/supabaseClient";
import { isSupabaseCollabEnabled } from "../../collab/persistence/inviteState";
import {
  createOwnedRoom,
  invitationLink,
  issueRoomInvite,
  listOwnedRooms,
  listRoomInvites,
  newInviteDraft,
  newRoomCredentials,
  revokeRoomInvite,
  recoverRoomKey,
} from "../../collab/persistence/roomManagement";

import "./RoomManagement.scss";

import type {
  InviteDraft,
  InviteSummary,
  RoomSummary,
} from "../../collab/persistence/roomManagement";

export const roomManagementOpenAtom = atom(false);

export const RoomManagement = () => {
  const [open, setOpen] = useAtom(roomManagementOpenAtom);
  const { status, session } = useCloudSession();
  if (!open || !isSupabaseCollabEnabled()) {
    return null;
  }
  return (
    <Dialog
      title="내 협업 방"
      size="small"
      onCloseRequest={() => setOpen(false)}
    >
      {status === "signed-in" && session && supabase ? (
        <RoomManager key={session.user.id} ownerId={session.user.id} />
      ) : (
        <p>로그인이 필요합니다.</p>
      )}
    </Dialog>
  );
};

const RoomManager = ({ ownerId }: { ownerId: string }) => {
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [selected, setSelected] = useState("");
  const [invites, setInvites] = useState<InviteSummary[]>([]);
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [scope, setScope] = useState<"read" | "write">("write");
  const [hours, setHours] = useState(24);
  const [input, setInput] = useState("");
  const [link, setLink] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const pending = useRef<{ draft: InviteDraft; create: boolean } | null>(null);
  const mounted = useRef(true);
  const running = useRef(false);
  const generation = useRef(0);
  const current = () =>
    mounted.current &&
    appJotaiStore.get(roomManagementOpenAtom) &&
    appJotaiStore.get(cloudSessionAtom).session?.user.id === ownerId;

  useEffect(() => {
    mounted.current = true;
    const operation = ++generation.current;
    listOwnedRooms(supabase!)
      .then((data) => {
        if (current() && generation.current === operation) {
          setRooms(data);
        }
      })
      .catch(() => {
        if (current() && generation.current === operation) {
          setError("방 목록을 불러오지 못했습니다.");
        }
      });
    return () => {
      mounted.current = false;
      generation.current = operation + 1;
    };
    // The keyed component owns one account for its entire lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = async (work: () => Promise<void>) => {
    if (running.current || !current()) {
      return;
    }
    running.current = true;
    generation.current++;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
    } catch (e) {
      if (
        current() &&
        !(e instanceof DOMException && e.name === "AbortError")
      ) {
        setError("요청을 완료하지 못했습니다. 다시 시도해주세요.");
      }
    } finally {
      running.current = false;
      if (current()) {
        setBusy(false);
      }
    }
  };

  const selectRoom = (roomId: string) =>
    run(async () => {
      const data = await listRoomInvites(supabase!, roomId);
      if (!current()) {
        return;
      }
      setSelected(roomId);
      setInvites(data);
      setLink("");
    });

  const issue = (create: boolean) =>
    run(async () => {
      if (!pending.current) {
        const room = create
          ? newRoomCredentials()
          : { roomId: selected, roomKey: keys[selected] };
        if (!room.roomKey) {
          throw new Error("Missing room key");
        }
        pending.current = {
          draft: newInviteDraft(room, create ? "write" : scope, hours),
          create,
        };
        setKeys((old) => ({ ...old, [room.roomId]: room.roomKey }));
      }
      const operation = pending.current;
      if (operation.create) {
        await createOwnedRoom(
          supabase!,
          operation.draft.invite.roomId,
          current,
        );
      }
      const url = await issueRoomInvite(supabase!, operation.draft, current);
      if (!current()) {
        return;
      }
      pending.current = null;
      setLink(url);
      setSelected(operation.draft.invite.roomId);
      const data = await listOwnedRooms(supabase!);
      if (!current()) {
        return;
      }
      setRooms(data);
      const entries = await listRoomInvites(
        supabase!,
        operation.draft.invite.roomId,
      );
      if (current()) {
        setInvites(entries);
      }
    });

  const recoverKey = () =>
    run(async () => {
      const roomKey = await recoverRoomKey(supabase!, input, selected, current);
      if (!current()) {
        return;
      }
      setKeys((old) => ({ ...old, [selected]: roomKey }));
      setInput("");
      setError("");
    });

  return (
    <div className="personal-room-management">
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <button
        type="button"
        disabled={busy || !!pending.current}
        onClick={() => issue(true)}
      >
        {PlusIcon} 새 빈 방
      </button>
      {pending.current && (
        <>
          <button type="button" disabled={busy} onClick={() => issue(false)}>
            발급 재시도
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              run(async () => {
                const roomId = pending.current!.draft.invite.roomId;
                pending.current = null;
                setSelected(roomId);
                setInvites([]);
                const data = await listOwnedRooms(supabase!);
                if (current()) {
                  setRooms(data);
                  if (!data.some((room) => room.id === roomId)) {
                    setSelected("");
                  }
                }
              })
            }
          >
            재시도 취소
          </button>
        </>
      )}
      <label>
        방
        <select
          value={selected}
          disabled={busy || !!pending.current}
          onChange={(e) => selectRoom(e.target.value)}
        >
          <option value="">선택</option>
          {rooms.map((room) => (
            <option key={room.id} value={room.id} disabled={room.disabled}>
              {room.id}
            </option>
          ))}
        </select>
      </label>
      {selected && (
        <>
          {!keys[selected] && (
            <div className="personal-room-management__recover">
              <label>
                기존 초대 링크
                <input
                  type="password"
                  autoComplete="off"
                  value={input}
                  disabled={busy}
                  onChange={(e) => setInput(e.target.value)}
                />
              </label>
              <button
                type="button"
                disabled={busy || !input}
                onClick={recoverKey}
              >
                확인
              </button>
            </div>
          )}
          <div className="personal-room-management__settings">
            <label>
              권한
              <select
                value={scope}
                disabled={busy || !!pending.current}
                onChange={(e) => setScope(e.target.value as "read" | "write")}
              >
                <option value="write">편집</option>
                <option value="read">읽기 전용</option>
              </select>
            </label>
            <label>
              만료
              <select
                value={hours}
                disabled={busy || !!pending.current}
                onChange={(e) => setHours(Number(e.target.value))}
              >
                <option value={1}>1시간</option>
                <option value={24}>1일</option>
                <option value={168}>7일</option>
              </select>
            </label>
            <button
              type="button"
              disabled={busy || !keys[selected] || !!pending.current}
              onClick={() => issue(false)}
            >
              초대 발급
            </button>
          </div>
          <ul>
            {invites.map((invite) => {
              const inactive =
                !!invite.revoked_at ||
                Date.parse(invite.expires_at) <= Date.now();
              return (
                <li key={invite.id}>
                  <div>
                    <span>
                      {invite.scope === "write" ? "편집" : "읽기 전용"} ·{" "}
                      {invite.revoked_at
                        ? "폐기됨"
                        : inactive
                        ? "만료됨"
                        : new Date(invite.expires_at).toLocaleString()}
                    </span>
                    <small>{invite.id}</small>
                  </div>
                  <button
                    type="button"
                    title="초대 링크 복사"
                    aria-label="초대 링크 복사"
                    disabled={busy || inactive || !keys[selected]}
                    onClick={() =>
                      run(async () => {
                        await navigator.clipboard.writeText(
                          invitationLink({
                            provider: "supabase",
                            roomId: selected,
                            roomKey: keys[selected],
                            inviteId: invite.id,
                          }),
                        );
                        if (current()) {
                          setNotice("링크를 복사했습니다.");
                        }
                      })
                    }
                  >
                    {copyIcon}
                  </button>
                  <button
                    type="button"
                    disabled={busy || inactive}
                    onClick={() => {
                      if (
                        window.confirm(
                          "이 초대를 폐기할까요? 연결 해제까지 최대 60초 걸릴 수 있습니다. 이미 받은 데이터는 회수할 수 없습니다.",
                        )
                      ) {
                        void run(async () => {
                          await revokeRoomInvite(
                            supabase!,
                            selected,
                            invite.id,
                          );
                          if (!current()) {
                            return;
                          }
                          const data = await listRoomInvites(
                            supabase!,
                            selected,
                          );
                          if (current()) {
                            setInvites(data);
                            setLink("");
                          }
                        });
                      }
                    }}
                  >
                    폐기
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {link && (
        <label>
          새 초대 링크
          <input readOnly value={link} onFocus={(e) => e.target.select()} />
          <button
            type="button"
            aria-label="새 초대 링크 복사"
            title="새 초대 링크 복사"
            disabled={busy}
            onClick={() =>
              run(async () => {
                await navigator.clipboard.writeText(link);
                if (current()) {
                  setNotice("링크를 복사했습니다.");
                }
              })
            }
          >
            {copyIcon}
          </button>
        </label>
      )}
      <p className="personal-room-management__warning">
        링크를 안전하게 보관하세요. 창을 닫으면 키가 지워지며, 기존 링크 없이는
        초대를 다시 발급할 수 없습니다. 링크를 가진 사람은 표시된 권한으로
        참여할 수 있습니다.
      </p>
    </div>
  );
};
