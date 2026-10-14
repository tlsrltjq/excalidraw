import { webcrypto } from "node:crypto";

import { getDefaultAppState } from "@excalidraw/excalidraw/appState";
import { generateEncryptionKey } from "@excalidraw/excalidraw/data/encryption";
import { restoreElements } from "@excalidraw/excalidraw/data/restore";
import { API } from "@excalidraw/excalidraw/tests/helpers/api";

import type { FileId } from "@excalidraw/element/types";

import { getSyncableElements } from "../../data";

import { createSupabaseCollabPersistence } from "./supabase";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Socket } from "socket.io-client";
import type Portal from "../Portal";
import type { SupabaseInvite } from "./invites";

const state = {
  ...getDefaultAppState(),
  width: 1000,
  height: 800,
  offsetTop: 0,
  offsetLeft: 0,
};
let invite: SupabaseInvite;
beforeEach(async () => {
  vi.stubGlobal("crypto", webcrypto);
  invite = {
    provider: "supabase",
    roomId: "sc_aaaaaaaaaaaaaaaaaaaa",
    roomKey: await generateEncryptionKey(),
    inviteId: "00000000-0000-4000-8000-000000000001",
  };
});
afterEach(() => vi.unstubAllGlobals());
const elements = () =>
  getSyncableElements(
    restoreElements([API.createElement({ id: "TEST-scene" })], null),
  );
const setup = (scope: "read" | "write" = "write", isCurrent = () => true) => {
  let record: {
    ciphertext: string;
    iv: string;
    revision: number;
    sceneVersion: number;
  } | null = null;
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (name === "collab_read_scene") {
      return { data: record, error: null };
    }
    if ((record?.revision ?? null) !== args.p_expected_revision) {
      return { data: { status: "conflict" }, error: null };
    }
    record = {
      ciphertext: args.p_ciphertext as string,
      iv: args.p_iv as string,
      revision: (record?.revision ?? 0) + 1,
      sceneVersion: args.p_scene_version as number,
    };
    return {
      data: { status: "saved", revision: record.revision },
      error: null,
    };
  });
  const invoke = vi.fn().mockResolvedValue({ data: { ok: true }, error: null });
  const client = { rpc, functions: { invoke } } as unknown as SupabaseClient;
  const adapter = createSupabaseCollabPersistence({
    client,
    invite,
    scope,
    isCurrent,
  });
  const socket = {} as Socket;
  const portal = {
    roomId: invite.roomId,
    roomKey: invite.roomKey,
    socket,
  } as Portal;
  return { adapter, rpc, invoke, portal, socket };
};
it("saves/restores encrypted scenes and caches only the current socket", async () => {
  const { adapter, portal, socket, rpc } = setup();
  const data = elements();
  expect(adapter.isSaved(portal, data)).toBe(false);
  const result = await adapter.saveScene(portal, data, state);
  expect(result?.[0].id).toBe("TEST-scene");
  expect(adapter.isSaved(portal, data)).toBe(true);
  const calls = rpc.mock.calls.length;
  expect(await adapter.saveScene(portal, data, state)).toBeNull();
  expect(rpc).toHaveBeenCalledTimes(calls);
  portal.socket = {} as Socket;
  expect(adapter.isSaved(portal, data)).toBe(false);
  await adapter.loadScene(invite.roomId, invite.roomKey, portal.socket);
  expect(adapter.isSaved(portal, data)).toBe(true);
  expect(
    await adapter.loadScene(invite.roomId, invite.roomKey, socket),
  ).toHaveLength(1);
});
it("returns null for a nonexistent scene or absent socket", async () => {
  const { adapter, portal } = setup();
  expect(
    await adapter.loadScene(invite.roomId, invite.roomKey, null),
  ).toBeNull();
  portal.socket = null;
  expect(await adapter.saveScene(portal, elements(), state)).toBeNull();
});
it("does not send read-only writes", async () => {
  const { adapter, portal, rpc, invoke } = setup("read");
  await expect(adapter.saveScene(portal, elements(), state)).rejects.toThrow(
    "Read-only",
  );
  expect(
    await adapter.saveFiles({
      prefix: `/files/rooms/${invite.roomId}`,
      files: [{ id: "TEST-file" as FileId, buffer: new Uint8Array([1]) }],
    }),
  ).toEqual({ savedFiles: [], erroredFiles: ["TEST-file"] });
  expect(rpc).not.toHaveBeenCalled();
  expect(invoke).not.toHaveBeenCalled();
});
it("rejects other room/key inputs without fallback", async () => {
  const { adapter, portal, rpc } = setup();
  await expect(
    adapter.loadScene("sc_bbbbbbbbbbbbbbbbbbbb", invite.roomKey, null),
  ).rejects.toThrow("access denied");
  portal.roomKey = "TEST-wrong-key";
  await expect(adapter.saveScene(portal, elements(), state)).rejects.toThrow(
    "access denied",
  );
  expect(rpc).not.toHaveBeenCalled();
});
it("does not return a load after the operation becomes stale", async () => {
  let current = true;
  const { adapter, rpc, socket } = setup("write", () => current);
  rpc.mockImplementationOnce(async () => {
    current = false;
    return { data: null, error: null };
  });
  await expect(
    adapter.loadScene(invite.roomId, invite.roomKey, socket),
  ).rejects.toHaveProperty("name", "AbortError");
});
it("does not cache save results after a portal switch", async () => {
  const { adapter, rpc, portal } = setup();
  rpc.mockImplementationOnce(async () => {
    portal.socket = {} as Socket;
    return { data: null, error: null };
  });
  await expect(
    adapter.saveScene(portal, elements(), state),
  ).rejects.toHaveProperty("name", "AbortError");
  expect(adapter.isSaved(portal, elements())).toBe(false);
  expect(rpc).toHaveBeenCalledTimes(1);
});
it("rejects malformed encrypted scenes rather than using another backend", async () => {
  const { adapter, rpc } = setup();
  rpc.mockResolvedValueOnce({
    data: { ciphertext: "bad", iv: "bad", revision: 1, sceneVersion: 1 },
    error: null,
  });
  await expect(
    adapter.loadScene(invite.roomId, invite.roomKey, null),
  ).rejects.toThrow();
  expect(rpc).toHaveBeenCalledTimes(1);
});
