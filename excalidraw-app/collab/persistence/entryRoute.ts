import { parseCollabPersistenceRoute } from "./invites";

const RETURN_KEY = "personal-cloud:invite-return:v1";
const TTL = 5 * 60 * 1000;

export const needsCollabEntry = (link: string) => {
  const url = new URL(link);
  return (
    url.searchParams.has("collabStorage") ||
    url.searchParams.has("invite") ||
    /^#room=sc_/i.test(url.hash)
  );
};

export const rememberInviteReturn = (
  link: string,
  storage: Storage = window.sessionStorage,
  now = Date.now(),
) => {
  const invite = parseCollabPersistenceRoute(link);
  if (invite.provider !== "supabase") {
    throw new Error("Invalid collaboration invitation");
  }
  const url = new URL(link);
  if (url.origin !== window.location.origin) {
    throw new Error("Invalid collaboration invitation");
  }
  const params = new URLSearchParams({
    collabStorage: "supabase",
    invite: invite.inviteId,
  });
  storage.setItem(
    RETURN_KEY,
    JSON.stringify({
      path: `${url.pathname}?${params}${url.hash}`,
      expiresAt: now + TTL,
    }),
  );
};

export const clearInviteReturn = (storage: Storage = window.sessionStorage) => {
  storage.removeItem(RETURN_KEY);
};

export const consumeInviteReturn = (
  storage: Storage = window.sessionStorage,
  now = Date.now(),
): string | null => {
  const value = storage.getItem(RETURN_KEY);
  storage.removeItem(RETURN_KEY);
  if (!value) {
    return null;
  }
  try {
    const saved: unknown = JSON.parse(value);
    if (!saved || typeof saved !== "object") {
      return null;
    }
    const { path, expiresAt } = saved as {
      path?: unknown;
      expiresAt?: unknown;
    };
    if (
      typeof path !== "string" ||
      !path.startsWith("/") ||
      path.startsWith("//") ||
      typeof expiresAt !== "number" ||
      !Number.isFinite(expiresAt) ||
      expiresAt <= now ||
      expiresAt > now + TTL
    ) {
      return null;
    }
    const url = new URL(path, window.location.origin);
    if (
      url.origin !== window.location.origin ||
      url.pathname !== window.location.pathname ||
      parseCollabPersistenceRoute(url.href).provider !== "supabase"
    ) {
      return null;
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
};

export const leaveCollabEntry = () => {
  const url = new URL(window.location.href);
  url.searchParams.delete("collabStorage");
  url.searchParams.delete("invite");
  if (url.hash.startsWith("#room=")) {
    url.hash = "";
  }
  window.history.replaceState({}, "", url);
  window.dispatchEvent(new Event("personal-collab-route-change"));
};
