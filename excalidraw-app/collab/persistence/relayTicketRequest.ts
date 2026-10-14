import { deriveInviteProof } from "./invites";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { SupabaseInvite } from "./invites";

export type RelayGrant = {
  ticket: string;
  scope: "read" | "write";
  expiresAt: number;
};

// These claims are scheduling hints, not signature verification. The relay ACK
// is authoritative; never enable editing from a parsed ticket alone.
export const readRelayGrant = (
  ticket: unknown,
  roomId: string,
  origin: string,
  challenge: string,
): RelayGrant => {
  const fail = () => {
    throw new Error("협업 입장권을 확인하지 못했습니다.");
  };
  if (typeof ticket !== "string" || ticket.length > 2048) {
    return fail();
  }
  const parts = ticket.split(".");
  if (
    parts.length !== 3 ||
    parts[0] !== "pct1" ||
    !/^[A-Za-z0-9_-]+$/.test(parts[1]) ||
    !/^[A-Za-z0-9_-]{86}$/.test(parts[2])
  ) {
    return fail();
  }
  let claims;
  try {
    claims = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return fail();
  }
  const fields = [
    "v",
    "iss",
    "aud",
    "roomId",
    "origin",
    "challenge",
    "scope",
    "iat",
    "exp",
  ];
  const now = Math.floor(Date.now() / 1000);
  if (
    !claims ||
    typeof claims !== "object" ||
    Array.isArray(claims) ||
    Object.keys(claims).length !== fields.length ||
    Object.keys(claims).some((name) => !fields.includes(name)) ||
    claims.v !== 1 ||
    claims.iss !== "personal-collab" ||
    claims.aud !== "personal-relay" ||
    claims.roomId !== roomId ||
    claims.origin !== origin ||
    claims.challenge !== challenge ||
    !["read", "write"].includes(claims.scope) ||
    !Number.isSafeInteger(claims.iat) ||
    !Number.isSafeInteger(claims.exp) ||
    claims.iat < 0 ||
    claims.exp - claims.iat !== 60 ||
    now < claims.iat ||
    now >= claims.exp
  ) {
    return fail();
  }
  return { ticket, scope: claims.scope, expiresAt: claims.exp * 1000 };
};

export const createRelayTicketRequest = (
  client: SupabaseClient,
  credentials: SupabaseInvite,
  origin: string,
) => {
  const invite = { ...credentials };
  return async (
    challenge: string,
    isCurrent: () => boolean,
    signal: AbortSignal,
  ) => {
    const check = () => {
      if (!isCurrent() || signal.aborted) {
        throw new DOMException("Operation is no longer current", "AbortError");
      }
    };
    check();
    const url = new URL(origin);
    if (
      !/^[a-f0-9]{64}$/.test(challenge) ||
      url.origin !== origin ||
      !["http:", "https:"].includes(url.protocol)
    ) {
      throw new Error("협업 입장 정보를 확인하지 못했습니다.");
    }
    const proof = await deriveInviteProof(invite);
    check();
    let result;
    try {
      result = await client.functions.invoke("collab-ticket", {
        signal,
        body: {
          roomId: invite.roomId,
          inviteId: invite.inviteId,
          proof,
          challenge,
        },
      });
    } catch {
      check();
      throw new Error("협업 입장권을 요청하지 못했습니다.");
    }
    check();
    if (
      result.error ||
      !result.data ||
      typeof result.data !== "object" ||
      Array.isArray(result.data) ||
      Object.keys(result.data).length !== 1 ||
      !Object.hasOwn(result.data, "ticket")
    ) {
      throw new Error("협업 입장권을 요청하지 못했습니다.");
    }
    return readRelayGrant(result.data.ticket, invite.roomId, origin, challenge);
  };
};
