import { webcrypto } from "node:crypto";

import {
  deriveInviteProof,
  hashInviteProof,
  parseCollabPersistenceRoute,
} from "./invites";

import type { SupabaseInvite } from "./invites";

const roomId = `sc_${"a".repeat(20)}`;
const inviteId = "11111111-1111-4111-8111-111111111111";
const syntheticKey = "AAAAAAAAAAAAAAAAAAAAAA";
const link = (extra = "", key = syntheticKey) =>
  `https://example.test/?collabStorage=supabase&invite=${inviteId}${extra}#room=${roomId},${key}`;

beforeEach(() => vi.stubGlobal("crypto", webcrypto));
afterEach(() => vi.unstubAllGlobals());

it("keeps legacy Firebase routes and the reserved room hash intact", () => {
  expect(
    parseCollabPersistenceRoute("https://example.test/#room=legacy,key"),
  ).toEqual({ provider: "firebase" });
  expect(parseCollabPersistenceRoute(link())).toEqual({
    provider: "supabase",
    roomId,
    roomKey: syntheticKey,
    inviteId,
  });
  expect(new URL(link()).search).not.toContain(syntheticKey);
});

it.each([
  "TEST invalid route",
  link("&collabStorage=firebase"),
  link("&invite=duplicate"),
  link("&drawing=another-document"),
  link().replace("supabase", "unknown"),
  link().replace(`invite=${inviteId}`, "invite=invalid"),
  link().replace("?collabStorage=supabase&", "?"),
  link().replace(roomId, "a".repeat(20)),
  link().replace("https:", "file:"),
  link("", `${"A".repeat(21)}B`),
])("rejects malformed or ambiguous invitation routes", (value) => {
  expect(() => parseCollabPersistenceRoute(value)).toThrow();
});

it("does not include the rejected URL in its error", () => {
  expect(() => parseCollabPersistenceRoute("TEST secret route")).toThrow(
    "Invalid collaboration route",
  );
});

it("derives deterministic, room/invite/key-specific bearer proofs without exposing the key", async () => {
  const invite = parseCollabPersistenceRoute(link()) as SupabaseInvite;
  const proof = await deriveInviteProof(invite);
  expect(proof).toMatch(/^[a-f0-9]{64}$/);
  expect(await deriveInviteProof(invite)).toBe(proof);
  const variants = [
    { ...invite, roomId: `sc_${"b".repeat(20)}` },
    { ...invite, inviteId: "22222222-2222-4222-8222-222222222222" },
    { ...invite, roomKey: "AQEBAQEBAQEBAQEBAQEBAQ" },
  ];
  for (const variant of variants) {
    expect(await deriveInviteProof(variant)).not.toBe(proof);
  }
  expect(proof).not.toContain(syntheticKey);
  const hash = await hashInviteProof(proof);
  expect(hash).toMatch(/^[a-f0-9]{64}$/);
  expect(hash).not.toBe(proof);
});

it("rejects invalid proof inputs without echoing credentials", async () => {
  await expect(hashInviteProof("TEST invalid proof")).rejects.toThrow(
    "Invalid collaboration proof",
  );
  await expect(
    deriveInviteProof({
      provider: "supabase",
      roomId,
      roomKey: "TEST invalid key",
      inviteId,
    }),
  ).rejects.toThrow("Invalid collaboration key");
});
