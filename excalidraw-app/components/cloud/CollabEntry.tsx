import { Dialog } from "@excalidraw/excalidraw/components/Dialog";
import { FilledButton } from "@excalidraw/excalidraw/components/FilledButton";
import { loginIcon, usersIcon } from "@excalidraw/excalidraw/components/icons";
import { useEffect, useRef, useState } from "react";

import { useCloudSession } from "../../cloud/session";
import { isCloudConfigured } from "../../cloud/supabaseClient";
import { useAtomValue } from "../../app-jotai";
import {
  inviteConnectionAtom,
  isSupabaseCollabEnabled,
} from "../../collab/persistence/inviteState";
import {
  checkCollabInvitation,
  signInForCollabInvite,
} from "../../collab/persistence/admission";
import {
  clearInviteReturn,
  consumeInviteReturn,
  leaveCollabEntry,
  needsCollabEntry,
} from "../../collab/persistence/entryRoute";
import { parseCollabPersistenceRoute } from "../../collab/persistence/invites";

import "./CollabEntry.scss";

import type { SupabaseInvite } from "../../collab/persistence/invites";
import type { ParticipationMode } from "../../collab/persistence/admission";
import type { CollabAPI } from "../../collab/Collab";

type Props = {
  collabAPI?: Pick<
    CollabAPI,
    "startInvitation" | "cancelInvitationConnection"
  > | null;
};

const EntryDialog = ({ link, collabAPI }: { link: string } & Props) => {
  const { status, session } = useCloudSession();
  const [phase, setPhase] = useState<
    "choose" | "checking" | "verified" | "error"
  >("choose");
  const [error, setError] = useState("");
  const [scope, setScope] = useState<"read" | "write" | null>(null);
  const generation = useRef(0);
  const busy = useRef(false);
  const userId = session?.user.id;

  useEffect(() => {
    generation.current++;
    busy.current = false;
    setPhase("choose");
    return () => {
      // Invalidate every operation started during this effect's lifetime.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      generation.current++;
      collabAPI?.cancelInvitationConnection();
    };
  }, [userId, collabAPI]);

  let invite: SupabaseInvite | null = null;
  try {
    const route = parseCollabPersistenceRoute(link);
    invite = route.provider === "supabase" ? route : null;
  } catch {
    /* Invalid invitations stay blocked instead of falling back. */
  }

  const participate = async (mode: ParticipationMode) => {
    if (!invite || busy.current) {
      return;
    }
    busy.current = true;
    const operation = ++generation.current;
    const current = () =>
      generation.current === operation && window.location.href === link;
    setPhase("checking");
    setError("");
    try {
      if (mode === "account" && status !== "signed-in") {
        await signInForCollabInvite(link);
        if (current()) {
          setPhase("choose");
        }
        return;
      }
      const permission = await checkCollabInvitation(invite, mode);
      if (!current()) {
        return;
      }
      if (isSupabaseCollabEnabled()) {
        if (!collabAPI) {
          throw new Error("편집기를 준비하지 못했습니다. 다시 참여하세요.");
        }
        await collabAPI.startInvitation(mode, current);
        return;
      }
      if (current()) {
        setScope(permission);
        setPhase("verified");
      }
    } catch (caught) {
      if (current()) {
        if (caught instanceof Error && caught.name === "AbortError") {
          setPhase("choose");
          return;
        }
        setError(
          caught instanceof Error
            ? caught.message
            : "초대를 확인하지 못했습니다.",
        );
        setPhase("error");
      }
    } finally {
      if (current()) {
        busy.current = false;
      }
    }
  };

  const close = () => {
    generation.current++;
    collabAPI?.cancelInvitationConnection();
    try {
      clearInviteReturn();
    } catch {
      /* Closing must work without storage. */
    }
    leaveCollabEntry();
  };
  const disabled =
    !invite ||
    !isCloudConfigured ||
    status === "loading" ||
    phase === "checking";
  return (
    <Dialog
      title="협업 초대"
      size="small"
      onCloseRequest={close}
      closeOnClickOutside={false}
    >
      <div className="personal-collab-entry">
        {!invite ? (
          <p role="alert">올바르지 않은 초대 링크입니다.</p>
        ) : !isCloudConfigured ? (
          <p role="alert">Cloud 연결을 사용할 수 없습니다.</p>
        ) : phase === "verified" ? (
          <div role="status" className="personal-collab-entry__status">
            <strong>
              {scope === "write"
                ? "편집 초대 확인 완료"
                : "읽기 전용 초대 확인 완료"}
            </strong>
            <p>공동편집 연결을 아직 사용할 수 없습니다.</p>
          </div>
        ) : (
          <>
            {phase === "checking" && <p role="status">확인 중...</p>}
            {error && <p role="alert">{error}</p>}
            <div className="personal-collab-entry__choices">
              <FilledButton
                icon={loginIcon}
                label={
                  status === "signed-in"
                    ? "로그인 계정으로 참여"
                    : "Google로 로그인"
                }
                disabled={disabled}
                fullWidth
                onClick={() => {
                  void participate("account");
                }}
              />
              <FilledButton
                icon={usersIcon}
                label="게스트로 참여"
                variant="outlined"
                disabled={disabled}
                fullWidth
                onClick={() => {
                  void participate("guest");
                }}
              />
            </div>
          </>
        )}
        <div className="personal-collab-entry__footer">
          <FilledButton
            label="닫기"
            variant="outlined"
            color="muted"
            onClick={close}
          />
        </div>
      </div>
    </Dialog>
  );
};

export const CollabEntry = ({ collabAPI }: Props = {}) => {
  const [link, setLink] = useState(window.location.href);
  const { status } = useCloudSession();
  const connected = useAtomValue(inviteConnectionAtom);
  useEffect(() => {
    const update = () => setLink(window.location.href);
    const events = ["hashchange", "popstate", "personal-collab-route-change"];
    events.forEach((event) => window.addEventListener(event, update));
    return () =>
      events.forEach((event) => window.removeEventListener(event, update));
  }, []);
  useEffect(() => {
    if (
      status !== "signed-in" ||
      window.location.hash ||
      window.location.search
    ) {
      return;
    }
    try {
      const path = consumeInviteReturn();
      if (path) {
        window.history.replaceState({}, "", path);
        setLink(window.location.href);
        window.dispatchEvent(new HashChangeEvent("hashchange"));
      }
    } catch {
      /* A blocked storage must not break local editing. */
    }
  }, [status, link]);
  return needsCollabEntry(link) && connected !== link ? (
    <EntryDialog key={link} link={link} collabAPI={collabAPI} />
  ) : null;
};
