import { createTicketHandler } from "../../../supabase/functions/collab-ticket/handler";
import {
  signRelayTicket,
  verifyRelayTicket,
} from "../../../supabase/functions/collab-ticket/ticket";

const context = {
  roomId: "sc_aaaaaaaaaaaaaaaaaaaa",
  origin: "http://127.0.0.1:3001",
  challenge: "b".repeat(64),
};
const input = {
  roomId: context.roomId,
  challenge: context.challenge,
  inviteId: "00000000-0000-4000-8000-000000000001",
  proof: "c".repeat(64),
};
const now = 1700000000000;
let keys: CryptoKeyPair;
beforeAll(async () => {
  keys = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign", "verify"],
  );
});
it.each(["read", "write"] as const)(
  "round trips %s without exposing invite/proof/key",
  async (scope) => {
    const ticket = await signRelayTicket(keys.privateKey, context, scope, now);
    expect(
      await verifyRelayTicket(keys.publicKey, ticket, context, now + 59000),
    ).toBe(scope);
    const payload = JSON.parse(
      atob(ticket.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
    );
    expect(Object.keys(payload).sort()).toEqual(
      [
        "v",
        "iss",
        "aud",
        "scope",
        "roomId",
        "origin",
        "challenge",
        "iat",
        "exp",
      ].sort(),
    );
    expect(JSON.stringify(payload)).not.toContain(input.proof);
  },
);
it.each([now - 1000, now + 60000, now + 120000])(
  "rejects future or expired ticket at %s",
  async (time) => {
    const ticket = await signRelayTicket(
      keys.privateKey,
      context,
      "write",
      now,
    );
    await expect(
      verifyRelayTicket(keys.publicKey, ticket, context, time),
    ).rejects.toThrow("Invalid collaboration ticket");
  },
);
it.each([
  { ...context, roomId: "sc_dddddddddddddddddddd" },
  { ...context, origin: "https://other.test" },
  { ...context, challenge: "e".repeat(64) },
])("rejects another room/origin/socket challenge %#", async (other) => {
  const ticket = await signRelayTicket(keys.privateKey, context, "read", now);
  await expect(
    verifyRelayTicket(keys.publicKey, ticket, other, now),
  ).rejects.toThrow();
});
it("rejects tampering, unknown versions, malformed and oversized tickets", async () => {
  const ticket = await signRelayTicket(keys.privateKey, context, "read", now);
  for (const bad of [
    ticket.replace("pct1", "pct2"),
    `${ticket}.extra`,
    "!",
    "x".repeat(2049),
    ticket.replace(/.$/, "!"),
  ]) {
    await expect(
      verifyRelayTicket(keys.publicKey, bad, context, now),
    ).rejects.toThrow();
  }
  const parts = ticket.split(".");
  const claims = JSON.parse(
    atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")),
  );
  claims.scope = "write";
  parts[1] = btoa(JSON.stringify(claims))
    .replace(/=+$/, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  await expect(
    verifyRelayTicket(keys.publicKey, parts.join("."), context, now),
  ).rejects.toThrow();
});
it("rejects signatures from another key", async () => {
  const other = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign", "verify"],
  );
  const ticket = await signRelayTicket(other.privateKey, context, "write", now);
  await expect(
    verifyRelayTicket(keys.publicKey, ticket, context, now),
  ).rejects.toThrow();
});
const setup = () => {
  const backend = {
    authorize: vi.fn().mockResolvedValue("read"),
    sign: vi.fn((ctx, scope) =>
      signRelayTicket(keys.privateKey, ctx, scope, now),
    ),
  };
  const handle = createTicketHandler(backend, [context.origin]);
  const request = (body: unknown = input, origin = context.origin) =>
    new Request("https://gateway.test", {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  return { backend, handle, request };
};
it.each([
  { v: 2 },
  { aud: "another-relay" },
  { iss: "another-issuer" },
  { scope: "admin" },
  { exp: now / 1000 + 600 },
  { iat: 1.5 },
  { unexpected: true },
])("rejects correctly signed but invalid claims %#", async (override) => {
  const ticket = await signRelayTicket(keys.privateKey, context, "read", now);
  const claims = JSON.parse(
    atob(ticket.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
  );
  const payload = btoa(JSON.stringify({ ...claims, ...override }))
    .replace(/=+$/, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  const message = `pct1.${payload}`;
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      keys.privateKey,
      new TextEncoder().encode(message),
    ),
  );
  const encoded = btoa(String.fromCharCode(...signature))
    .replace(/=+$/, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  await expect(
    verifyRelayTicket(keys.publicKey, `${message}.${encoded}`, context, now),
  ).rejects.toThrow();
});
it("serves preflight without permission lookup", async () => {
  const { backend, handle } = setup();
  const response = await handle(
    new Request("https://gateway.test", {
      method: "OPTIONS",
      headers: { origin: context.origin },
    }),
  );
  expect(response.status).toBe(204);
  expect(response.headers.get("access-control-allow-origin")).toBe(
    context.origin,
  );
  expect(backend.authorize).not.toHaveBeenCalled();
});
it("rejects unsupported content type and forged Content-Length", async () => {
  const { backend, handle } = setup();
  const cases: Record<string, string>[] = [
    { "content-type": "text/plain" },
    { "content-type": "application/json", "content-length": "4097" },
  ];
  for (const headers of cases) {
    const response = await handle(
      new Request("https://gateway.test", {
        method: "POST",
        headers: { origin: context.origin, ...headers },
        body: "{}",
      }),
    );
    expect([413, 415]).toContain(response.status);
  }
  expect(backend.authorize).not.toHaveBeenCalled();
});
it("times out an unfinished request body without signing", async () => {
  vi.useFakeTimers();
  try {
    const { backend, handle } = setup();
    const operation = handle(
      new Request("https://gateway.test", {
        method: "POST",
        headers: { origin: context.origin, "content-type": "application/json" },
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode("{"));
          },
        }),
        // Node fetch requires duplex for streamed request bodies.
        duplex: "half",
      } as RequestInit),
    );
    await vi.advanceTimersByTimeAsync(10000);
    expect((await operation).status).toBe(408);
    expect(backend.sign).not.toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
  }
});
it("issues server-authorized read scope and keeps response uncacheable", async () => {
  const { backend, handle, request } = setup();
  const response = await handle(request());
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  const { ticket } = await response.json();
  expect(await verifyRelayTicket(keys.publicKey, ticket, context, now)).toBe(
    "read",
  );
  expect(backend.authorize).toHaveBeenCalledWith(input);
});
it.each([null, "admin"])(
  "does not sign denied/unknown permissions %s",
  async (scope) => {
    const { backend, handle, request } = setup();
    backend.authorize.mockResolvedValue(scope);
    expect((await handle(request())).status).toBe(403);
    expect(backend.sign).not.toHaveBeenCalled();
  },
);
it.each([
  null,
  [],
  { ...input, scope: "write" },
  { ...input, roomKey: "TEST" },
  { ...input, proof: "!" },
  { ...input, challenge: "!" },
])("rejects invalid/extra body %#", async (body) => {
  const { backend, handle, request } = setup();
  expect((await handle(request(body))).status).toBe(400);
  expect(backend.authorize).not.toHaveBeenCalled();
});
it("rejects other origins, large streams and unsupported methods before authorization", async () => {
  const { backend, handle, request } = setup();
  expect((await handle(request(input, "https://other.test"))).status).toBe(403);
  expect((await handle(request("x".repeat(4096)))).status).toBe(413);
  expect(
    (
      await handle(
        new Request("https://gateway.test", {
          headers: { origin: context.origin },
        }),
      )
    ).status,
  ).toBe(405);
  expect(backend.authorize).not.toHaveBeenCalled();
});
it("does not expose backend errors or sign on authorization failure", async () => {
  const { backend, handle, request } = setup();
  backend.authorize.mockRejectedValue(
    new Error("TEST-sensitive-backend-detail"),
  );
  const response = await handle(request());
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("TEST-sensitive");
  expect(backend.sign).not.toHaveBeenCalled();
});
