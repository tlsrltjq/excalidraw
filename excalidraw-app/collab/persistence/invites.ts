const ROOM_ID = /^sc_[a-f0-9]{20}$/;
const INVITE_ID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

export type SupabaseInvite = {
  provider: "supabase";
  roomId: string;
  roomKey: string;
  inviteId: string;
};

export const assertSupabaseRoomId = (roomId: string) => {
  if (!ROOM_ID.test(roomId)) {
    throw new Error("Invalid collaboration room");
  }
};

const decodeRoomKey = (roomKey: string) => {
  if (!/^[A-Za-z0-9_-]{22}$/.test(roomKey)) {
    throw new Error("Invalid collaboration key");
  }
  const bytes = Uint8Array.from(
    atob(`${roomKey.replace(/-/g, "+").replace(/_/g, "/")}==`),
    (character) => character.charCodeAt(0),
  );
  const canonical = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  if (bytes.length !== 16 || canonical !== roomKey) {
    throw new Error("Invalid collaboration key");
  }
  return bytes;
};

export const parseCollabPersistenceRoute = (
  link: string,
): { provider: "firebase" } | SupabaseInvite => {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    throw new Error("Invalid collaboration route");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  ) {
    throw new Error("Invalid collaboration route");
  }
  const providers = url.searchParams.getAll("collabStorage");
  const invites = url.searchParams.getAll("invite");
  if (
    providers.length > 1 ||
    invites.length > 1 ||
    (providers.length === 0 &&
      (invites.length > 0 || url.hash.startsWith("#room=sc_")))
  ) {
    throw new Error("Invalid collaboration route");
  }
  if (providers.length === 0) {
    return { provider: "firebase" };
  }
  if (
    providers[0] !== "supabase" ||
    invites.length !== 1 ||
    url.searchParams.has("drawing")
  ) {
    throw new Error("Unsupported collaboration route");
  }
  const room = url.hash.match(/^#room=(sc_[a-f0-9]{20}),([A-Za-z0-9_-]{22})$/);
  const inviteId = invites[0];
  if (!room || !INVITE_ID.test(inviteId)) {
    throw new Error("Invalid collaboration invitation");
  }
  decodeRoomKey(room[2]);
  return { provider: "supabase", roomId: room[1], roomKey: room[2], inviteId };
};

export const deriveInviteProof = async (invite: SupabaseInvite) => {
  assertSupabaseRoomId(invite.roomId);
  if (!INVITE_ID.test(invite.inviteId)) {
    throw new Error("Invalid collaboration invitation");
  }
  const key = await window.crypto.subtle.importKey(
    "raw",
    decodeRoomKey(invite.roomKey),
    "HKDF",
    false,
    ["deriveBits"],
  );
  const proof = await window.crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new TextEncoder().encode(invite.roomId),
      info: new TextEncoder().encode(
        `personal-excalidraw/invite/v1/${invite.inviteId}`,
      ),
    },
    key,
    256,
  );
  return Array.from(new Uint8Array(proof), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
};

export const hashInviteProof = async (proof: string) => {
  if (!/^[a-f0-9]{64}$/.test(proof)) {
    throw new Error("Invalid collaboration proof");
  }
  const hash = await window.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(proof),
  );
  return Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
};
