import { createClient } from "@supabase/supabase-js";

import { supabase } from "../../cloud/supabaseClient";

import { deriveInviteProof } from "./invites";
import { clearInviteReturn, rememberInviteReturn } from "./entryRoute";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { SupabaseInvite } from "./invites";

export type ParticipationMode = "account" | "guest";
let guestClient: SupabaseClient | null = null;

export const getCollabParticipantClient = (mode: ParticipationMode) => {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!supabase || !url || !key) {
    throw new Error("Cloud 연결을 사용할 수 없습니다.");
  }
  if (mode === "account") {
    return supabase;
  }
  if (!guestClient) {
    guestClient = createClient(url, key, {
      auth: {
        storageKey: "personal-cloud-collab-guest",
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }
  return guestClient;
};

export const checkCollabInvitation = async (
  invite: SupabaseInvite,
  mode: ParticipationMode,
): Promise<"read" | "write"> => {
  const client = getCollabParticipantClient(mode);
  const proof = await deriveInviteProof(invite);
  let result;
  try {
    result = await client.rpc("collab_check_invite", {
      p_room_id: invite.roomId,
      p_invite_id: invite.inviteId,
      p_proof: proof,
    });
  } catch {
    throw new Error(
      "초대를 확인하지 못했습니다. 연결 상태를 확인하고 다시 시도하세요.",
    );
  }
  if (result.error?.code === "42501") {
    throw new Error(
      "사용할 수 없는 초대입니다. 만료 또는 폐기 여부를 확인하세요.",
    );
  }
  if (result.error || !["read", "write"].includes(result.data)) {
    throw new Error(
      "초대를 확인하지 못했습니다. 연결 상태와 서버 설정을 확인하세요.",
    );
  }
  return result.data;
};

export const signInForCollabInvite = async (link: string) => {
  if (!supabase) {
    throw new Error("Cloud 연결을 사용할 수 없습니다.");
  }
  try {
    rememberInviteReturn(link);
  } catch {
    throw new Error(
      "로그인 복귀 정보를 보관하지 못했습니다. 브라우저 저장소를 확인하세요.",
    );
  }
  try {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) {
      throw new Error("OAuth failed");
    }
  } catch {
    try {
      clearInviteReturn();
    } catch {
      /* Storage may be unavailable. */
    }
    throw new Error("로그인을 시작하지 못했습니다. 다시 시도하세요.");
  }
};
