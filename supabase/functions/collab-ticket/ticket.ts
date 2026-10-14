export const TICKET_TTL_SECONDS = 60;
const encoder = new TextEncoder();
const ROOM = /^sc_[a-f0-9]{20}$/;
const CHALLENGE = /^[a-f0-9]{64}$/;

export type TicketContext = {
  roomId: string;
  origin: string;
  challenge: string;
};
type Claims = TicketContext & {
  v: 1;
  iss: "personal-collab";
  aud: "personal-relay";
  scope: "read" | "write";
  iat: number;
  exp: number;
};
const fail = (): never => {
  throw new Error("Invalid collaboration ticket");
};
const validContext = (context: TicketContext) => {
  try {
    const url = new URL(context.origin);
    return (
      ROOM.test(context.roomId) &&
      CHALLENGE.test(context.challenge) &&
      url.origin === context.origin &&
      ["https:", "http:"].includes(url.protocol)
    );
  } catch {
    return false;
  }
};
const encode = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
const decode = (text: string): Uint8Array<ArrayBuffer> => {
  if (!/^[A-Za-z0-9_-]+$/.test(text)) {
    return fail();
  }
  try {
    const bytes = Uint8Array.from(
      atob(text.replace(/-/g, "+").replace(/_/g, "/")),
      (char) => char.charCodeAt(0),
    );
    return encode(bytes) === text ? bytes : fail();
  } catch {
    return fail();
  }
};
const checkKey = (key: CryptoKey, type: "private" | "public") => {
  const algorithm = key.algorithm as EcKeyAlgorithm;
  if (
    key.type !== type ||
    algorithm.name !== "ECDSA" ||
    algorithm.namedCurve !== "P-256"
  ) {
    fail();
  }
};
const timestamp = (now: number) => {
  const seconds = Math.floor(now / 1000);
  if (!Number.isSafeInteger(seconds) || seconds < 0) {
    fail();
  }
  return seconds;
};

export const signRelayTicket = async (
  key: CryptoKey,
  context: TicketContext,
  scope: "read" | "write",
  now = Date.now(),
): Promise<string> => {
  checkKey(key, "private");
  if (!validContext(context) || !["read", "write"].includes(scope)) {
    fail();
  }
  const iat = timestamp(now);
  const claims: Claims = {
    v: 1,
    iss: "personal-collab",
    aud: "personal-relay",
    roomId: context.roomId,
    origin: context.origin,
    challenge: context.challenge,
    scope,
    iat,
    exp: iat + TICKET_TTL_SECONDS,
  };
  const payload = encode(encoder.encode(JSON.stringify(claims)));
  const message = `pct1.${payload}`;
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    encoder.encode(message),
  );
  return `${message}.${encode(new Uint8Array(signature))}`;
};

export const verifyRelayTicket = async (
  key: CryptoKey,
  ticket: string,
  context: TicketContext,
  now = Date.now(),
): Promise<"read" | "write"> => {
  checkKey(key, "public");
  if (
    typeof ticket !== "string" ||
    ticket.length > 2048 ||
    !validContext(context)
  ) {
    return fail();
  }
  const parts = ticket.split(".");
  if (parts.length !== 3 || parts[0] !== "pct1") {
    return fail();
  }
  const signature = decode(parts[2]);
  if (
    signature.length !== 64 ||
    !(await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      signature,
      encoder.encode(`${parts[0]}.${parts[1]}`),
    ))
  ) {
    return fail();
  }
  let value: unknown;
  try {
    value = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(decode(parts[1])),
    );
  } catch {
    return fail();
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fail();
  }
  const claims = value as Claims;
  const keys = [
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
  const time = timestamp(now);
  if (
    Object.keys(claims).length !== keys.length ||
    Object.keys(claims).some((name) => !keys.includes(name)) ||
    claims.v !== 1 ||
    claims.iss !== "personal-collab" ||
    claims.aud !== "personal-relay" ||
    claims.roomId !== context.roomId ||
    claims.origin !== context.origin ||
    claims.challenge !== context.challenge ||
    !["read", "write"].includes(claims.scope) ||
    !Number.isSafeInteger(claims.iat) ||
    !Number.isSafeInteger(claims.exp) ||
    claims.iat < 0 ||
    claims.exp - claims.iat !== TICKET_TTL_SECONDS ||
    time < claims.iat ||
    time >= claims.exp
  ) {
    return fail();
  }
  return claims.scope;
};
