import { webcrypto } from "node:crypto";

import { signRelayTicket } from "../../../supabase/functions/collab-ticket/ticket";

import { createRelayTicketRequest, readRelayGrant } from "./relayTicketRequest";

import type { SupabaseClient } from "@supabase/supabase-js";

const invite = {
  provider: "supabase" as const,
  roomId: `sc_${"a".repeat(20)}`,
  roomKey: "AAAAAAAAAAAAAAAAAAAAAA",
  inviteId: "00000000-0000-4000-8000-000000000001",
};
const origin = location.origin;
const challenge = "b".repeat(64);
let keys: CryptoKeyPair;
beforeAll(async () => {
  keys = await webcrypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign", "verify"],
  );
});
beforeEach(() => vi.stubGlobal("crypto", webcrypto));
afterEach(() => vi.unstubAllGlobals());
const token = (override = {}) =>
  signRelayTicket(
    keys.privateKey,
    { roomId: invite.roomId, origin, challenge, ...override },
    "read",
  );
const setup = () => {
  const invoke = vi.fn(async () => ({
    data: { ticket: await token() },
    error: null as unknown,
  }));
  const client = { functions: { invoke } } as unknown as SupabaseClient;
  const request = createRelayTicketRequest(client, invite, origin);
  return { invoke, request, abort: new AbortController() };
};
it("requests a ticket using proof, never the room key or requested scope", async () => {
  const t = setup();
  const result = await t.request(challenge, () => true, t.abort.signal);
  expect(result.scope).toBe("read");
  expect(t.invoke).toHaveBeenCalledWith("collab-ticket", {
    signal: t.abort.signal,
    body: {
      roomId: invite.roomId,
      inviteId: invite.inviteId,
      proof: expect.stringMatching(/^[a-f0-9]{64}$/),
      challenge,
    },
  });
});
it("rejects bad challenge before invoking the backend", async () => {
  const t = setup();
  await expect(t.request("!", () => true, t.abort.signal)).rejects.toThrow();
  expect(t.invoke).not.toHaveBeenCalled();
});
it("rejects aborted and superseded operations before sending", async () => {
  const t = setup();
  t.abort.abort();
  await expect(
    t.request(challenge, () => true, t.abort.signal),
  ).rejects.toMatchObject({ name: "AbortError" });
  await expect(
    t.request(challenge, () => false, new AbortController().signal),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(t.invoke).not.toHaveBeenCalled();
});
it("does not transmit after operation changes during proof derivation", async () => {
  const t = setup();
  let current = true;
  const operation = t.request(challenge, () => current, t.abort.signal);
  current = false;
  await expect(operation).rejects.toMatchObject({ name: "AbortError" });
  expect(t.invoke).not.toHaveBeenCalled();
});
it("ignores a late invoke result", async () => {
  const t = setup();
  let current = true;
  t.invoke.mockImplementation(async () => {
    current = false;
    return { data: { ticket: await token() }, error: null };
  });
  await expect(
    t.request(challenge, () => current, t.abort.signal),
  ).rejects.toMatchObject({ name: "AbortError" });
});
it.each([null, {}, { ticket: "TEST" }, { ticket: "TEST", scope: "write" }, []])(
  "rejects unknown response %#",
  async (data) => {
    const t = setup();
    t.invoke.mockResolvedValue({ data: data as any, error: null });
    await expect(
      t.request(challenge, () => true, t.abort.signal),
    ).rejects.toThrow();
  },
);
it("sanitizes rejection and error response details", async () => {
  const t = setup();
  t.invoke.mockRejectedValueOnce(new Error("TEST-private-body"));
  await expect(
    t.request(challenge, () => true, t.abort.signal),
  ).rejects.not.toThrow("TEST-private");
  t.invoke.mockResolvedValue({
    data: { ticket: "TEST" },
    error: { message: "TEST-private" },
  });
  await expect(
    t.request(challenge, () => true, t.abort.signal),
  ).rejects.not.toThrow("TEST-private");
});
it.each([
  { roomId: `sc_${"c".repeat(20)}` },
  { origin: "https://other.test" },
  { challenge: "d".repeat(64) },
])("rejects ticket hints for another context %#", async (context) => {
  expect(() => readRelayGrant("!", invite.roomId, origin, challenge)).toThrow();
  const ticket = await token(context);
  expect(() =>
    readRelayGrant(ticket, invite.roomId, origin, challenge),
  ).toThrow();
});
it("rejects expired hints rather than opening from parsed claims", async () => {
  const ticket = await signRelayTicket(
    keys.privateKey,
    { roomId: invite.roomId, origin, challenge },
    "write",
    Date.now() - 61000,
  );
  expect(() =>
    readRelayGrant(ticket, invite.roomId, origin, challenge),
  ).toThrow();
});
