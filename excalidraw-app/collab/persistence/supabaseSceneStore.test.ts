import { webcrypto } from "node:crypto";

import { deriveInviteProof } from "./invites";
import { createSupabaseSceneStore } from "./supabaseSceneStore";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { SupabaseInvite } from "./invites";

const invite: SupabaseInvite = {
  provider: "supabase",
  roomId: `sc_${"a".repeat(20)}`,
  roomKey: "AAAAAAAAAAAAAAAAAAAAAA",
  inviteId: "00000000-0000-4000-8000-000000000001",
};
const scene = {
  ciphertext: new ArrayBuffer(16),
  iv: new Uint8Array(12),
  sceneVersion: 0,
};
const setup = () => {
  const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
  const client = { rpc } as unknown as SupabaseClient;
  return { rpc, store: createSupabaseSceneStore(client, invite) };
};
beforeEach(() => vi.stubGlobal("crypto", webcrypto));
afterEach(() => vi.unstubAllGlobals());

it("sends the derived proof, never the room encryption key, for reads", async () => {
  const { rpc, store } = setup();
  await expect(store.read(invite.roomId)).resolves.toBeNull();
  expect(rpc).toHaveBeenCalledWith("collab_read_scene", {
    p_room_id: invite.roomId,
    p_invite_id: invite.inviteId,
    p_proof: await deriveInviteProof(invite),
  });
});

it("decodes PostgreSQL base64 with whitespace without altering binary bytes", async () => {
  const { rpc, store } = setup();
  rpc.mockResolvedValue({
    data: {
      ciphertext: "AAAAAAAAAAAA\nAAAAAAAAAA==",
      iv: "AAAAAAAAAAAAAAAA",
      revision: 1,
      sceneVersion: 0,
    },
    error: null,
  });
  const result = await store.read(invite.roomId);
  expect(new Uint8Array(result!.ciphertext)).toEqual(new Uint8Array(16));
  expect(result!.iv).toEqual(scene.iv);
});

it("encodes encrypted bytes and uses null only for initial CAS creation", async () => {
  const { rpc, store } = setup();
  rpc.mockResolvedValue({
    data: { status: "saved", revision: 1 },
    error: null,
  });
  await expect(
    store.compareAndSwap(invite.roomId, null, scene),
  ).resolves.toEqual({ status: "saved", revision: 1 });
  expect(rpc.mock.calls[0][1]).toMatchObject({
    p_expected_revision: null,
    p_ciphertext: "AAAAAAAAAAAAAAAAAAAAAA==",
    p_iv: "AAAAAAAAAAAAAAAA",
    p_scene_version: 0,
  });
});

it("returns explicit conflicts without fallback or extra requests", async () => {
  const { rpc, store } = setup();
  rpc.mockResolvedValue({ data: { status: "conflict" }, error: null });
  await expect(store.compareAndSwap(invite.roomId, 1, scene)).resolves.toEqual({
    status: "conflict",
  });
  expect(rpc).toHaveBeenCalledTimes(1);
});

it.each(["42501", "PGRST202"])(
  "sanitizes backend errors (%s)",
  async (code) => {
    const { rpc, store } = setup();
    rpc.mockResolvedValue({
      data: null,
      error: { code, message: "TEST sensitive body" },
    });
    await expect(store.read(invite.roomId)).rejects.toThrow(
      code === "42501"
        ? "Collaboration access denied"
        : "Collaboration request failed",
    );
  },
);

it("rejects another room before requesting", async () => {
  const { rpc, store } = setup();
  await expect(store.read(`sc_${"b".repeat(20)}`)).rejects.toThrow(
    "Collaboration access denied",
  );
  expect(rpc).not.toHaveBeenCalled();
});

it("sanitizes rejected transport errors", async () => {
  const { rpc, store } = setup();
  rpc.mockRejectedValue(new Error("TEST sensitive request"));
  await expect(store.read(invite.roomId)).rejects.toThrow(
    "Collaboration request failed",
  );
});

it.each([
  {},
  { ciphertext: "!", iv: "AAAAAAAAAAAAAAAA", revision: 1, sceneVersion: 0 },
  {
    ciphertext: "AAAAAAAAAAAAAAAAAAAAAA==",
    iv: "AA==",
    revision: 1,
    sceneVersion: 0,
  },
  {
    ciphertext: "AAAAAAAAAAAAAAAAAAAAAA==",
    iv: "AAAAAAAAAAAAAAAA",
    revision: 0,
    sceneVersion: 0,
  },
  {
    ciphertext: "AAAAAAAAAAAAAAAAAAAAAA==",
    iv: "AAAAAAAAAAAAAAAA",
    revision: 1,
    sceneVersion: -1,
  },
])("rejects malformed remote scene %#", async (data) => {
  const { rpc, store } = setup();
  rpc.mockResolvedValue({ data, error: null });
  await expect(store.read(invite.roomId)).rejects.toThrow(
    "Invalid collaboration response",
  );
});

it("rejects wrong saved revision", async () => {
  const { rpc, store } = setup();
  rpc.mockResolvedValue({
    data: { status: "saved", revision: 5 },
    error: null,
  });
  await expect(store.compareAndSwap(invite.roomId, 1, scene)).rejects.toThrow(
    "Invalid collaboration response",
  );
});

it("rejects oversized local ciphertext without a request", async () => {
  const { rpc, store } = setup();
  await expect(
    store.compareAndSwap(invite.roomId, null, {
      ...scene,
      ciphertext: new ArrayBuffer(2097153),
    }),
  ).rejects.toThrow("Invalid encrypted collaboration scene");
  expect(rpc).not.toHaveBeenCalled();
});
