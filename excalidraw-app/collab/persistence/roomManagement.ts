import {
  assertSupabaseRoomId,
  deriveInviteProof,
  hashInviteProof,
  parseCollabPersistenceRoute,
} from "./invites";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { SupabaseInvite } from "./invites";

export type RoomSummary = { id: string; disabled: boolean; created_at: string };
export type InviteSummary = {
  id: string;
  scope: "read" | "write";
  expires_at: string;
  revoked_at: string | null;
};
export type InviteDraft = {
  invite: SupabaseInvite;
  scope: "read" | "write";
  expiresAt: string;
};

const checkCurrent = (current: () => boolean) => {
  if (!current()) {
    throw new DOMException("Cancelled", "AbortError");
  }
};

export const newRoomCredentials = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  const roomId = `sc_${Array.from(bytes, (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("")}`;
  const roomKey = btoa(
    String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))),
  )
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return { roomId, roomKey };
};

export const newInviteDraft = (
  room: { roomId: string; roomKey: string },
  scope: "read" | "write",
  hours: number,
): InviteDraft => {
  if (![1, 24, 168].includes(hours) || !["read", "write"].includes(scope)) {
    throw new Error("Invalid invitation settings");
  }
  return {
    invite: { provider: "supabase", ...room, inviteId: crypto.randomUUID() },
    scope,
    expiresAt: new Date(Date.now() + hours * 3600000).toISOString(),
  };
};

export const invitationLink = (invite: SupabaseInvite) => {
  const url = new URL(window.location.pathname, window.location.origin);
  url.searchParams.set("collabStorage", "supabase");
  url.searchParams.set("invite", invite.inviteId);
  url.hash = `room=${invite.roomId},${invite.roomKey}`;
  parseCollabPersistenceRoute(url.href);
  return url.href;
};

export const listOwnedRooms = async (client: SupabaseClient) => {
  const { data, error } = await client
    .from("collab_rooms")
    .select("id,disabled,created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    throw new Error("방 목록을 불러오지 못했습니다.");
  }
  return (data ?? []) as RoomSummary[];
};

export const listRoomInvites = async (
  client: SupabaseClient,
  roomId: string,
) => {
  assertSupabaseRoomId(roomId);
  const { data, error } = await client
    .from("collab_invites")
    .select("id,scope,expires_at,revoked_at")
    .eq("room_id", roomId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    throw new Error("초대 목록을 불러오지 못했습니다.");
  }
  return (data ?? []) as InviteSummary[];
};

export const createOwnedRoom = async (
  client: SupabaseClient,
  roomId: string,
  current: () => boolean,
) => {
  assertSupabaseRoomId(roomId);
  checkCurrent(current);
  const { error } = await client.rpc("collab_create_room", {
    p_room_id: roomId,
  });
  checkCurrent(current);
  if (error) {
    // A lost response may already have committed. RLS scopes this lookup.
    const result = await client
      .from("collab_rooms")
      .select("id,disabled")
      .eq("id", roomId)
      .maybeSingle();
    checkCurrent(current);
    if (result.error || result.data?.id !== roomId || result.data.disabled) {
      throw new Error("방을 만들지 못했습니다. 같은 요청을 다시 시도해주세요.");
    }
  }
};

export const issueRoomInvite = async (
  client: SupabaseClient,
  draft: InviteDraft,
  current: () => boolean,
) => {
  // Validate key, room and UUID before any request.
  const proof = await deriveInviteProof(draft.invite);
  const proofHash = await hashInviteProof(proof);
  checkCurrent(current);
  const { error } = await client.rpc("collab_issue_invite", {
    p_room_id: draft.invite.roomId,
    p_invite_id: draft.invite.inviteId,
    p_proof_hash: proofHash,
    p_scope: draft.scope,
    p_expires_at: draft.expiresAt,
  });
  checkCurrent(current);
  if (error) {
    const result = await client
      .from("collab_invites")
      .select("id,scope,expires_at,revoked_at")
      .eq("room_id", draft.invite.roomId)
      .eq("id", draft.invite.inviteId)
      .maybeSingle();
    checkCurrent(current);
    if (
      result.error ||
      result.data?.id !== draft.invite.inviteId ||
      result.data.scope !== draft.scope ||
      result.data.revoked_at !== null ||
      Date.parse(result.data.expires_at) !== Date.parse(draft.expiresAt)
    ) {
      throw new Error(
        "초대를 발급하지 못했습니다. 같은 요청을 다시 시도해주세요.",
      );
    }
  }
  if (error) {
    const checked = await client.rpc("collab_check_invite", {
      p_room_id: draft.invite.roomId,
      p_invite_id: draft.invite.inviteId,
      p_proof: proof,
    });
    checkCurrent(current);
    if (checked.error || checked.data !== draft.scope) {
      throw new Error("초대 확인에 실패했습니다.");
    }
  }
  return invitationLink(draft.invite);
};

export const recoverRoomKey = async (
  client: SupabaseClient,
  link: string,
  roomId: string,
  current: () => boolean,
) => {
  const invite = parseCollabPersistenceRoute(link);
  if (invite.provider !== "supabase" || invite.roomId !== roomId) {
    throw new Error("Invalid room link");
  }
  const proofHash = await hashInviteProof(await deriveInviteProof(invite));
  checkCurrent(current);
  // Owner-only RLS lookup permits key recovery even after this invite expires.
  // This never reactivates the old grant or exposes its hash to the UI.
  const { data, error } = await client
    .from("collab_invites")
    .select("proof_hash")
    .eq("room_id", roomId)
    .eq("id", invite.inviteId)
    .maybeSingle();
  checkCurrent(current);
  if (error || data?.proof_hash !== proofHash) {
    throw new Error("Invalid room link");
  }
  return invite.roomKey;
};

export const revokeRoomInvite = async (
  client: SupabaseClient,
  roomId: string,
  inviteId: string,
) => {
  assertSupabaseRoomId(roomId);
  const { error } = await client.rpc("collab_revoke_invite", {
    p_room_id: roomId,
    p_invite_id: inviteId,
  });
  if (error) {
    throw new Error("초대를 폐기하지 못했습니다.");
  }
};
