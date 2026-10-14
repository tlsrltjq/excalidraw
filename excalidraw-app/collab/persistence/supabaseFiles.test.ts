import { Blob as NodeBlob } from "node:buffer";
import { webcrypto } from "node:crypto";

import { generateEncryptionKey } from "@excalidraw/excalidraw/data/encryption";
import { compressData } from "@excalidraw/excalidraw/data/encode";

import type { BinaryFileData, DataURL } from "@excalidraw/excalidraw/types";

import type { FileId } from "@excalidraw/element/types";

import { createFileHandler } from "../../../supabase/functions/collab-files/handler";
import { FILE_UPLOAD_MAX_BYTES } from "../../app_constants";
import { encodeFilesForUpload } from "../../data/FileManager";

import { createSupabaseFiles } from "./supabaseFiles";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { SupabaseInvite } from "./invites";

const id = "TEST-image" as FileId;
const other = "TEST-other" as FileId;
const dataURL = "data:image/png;base64,VEVTVC1jb2RlYw==" as DataURL;
let invite: SupabaseInvite;
beforeEach(async () => {
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal("Blob", NodeBlob);
  invite = {
    provider: "supabase",
    roomId: "sc_aaaaaaaaaaaaaaaaaaaa",
    roomKey: await generateEncryptionKey(),
    inviteId: "00000000-0000-4000-8000-000000000001",
  };
});
afterEach(() => {
  vi.unstubAllGlobals();
});
const fixture = async () =>
  encodeFilesForUpload({
    files: new Map([
      [
        id,
        { id, dataURL, mimeType: "image/png", created: 1 } as BinaryFileData,
      ],
    ]),
    maxBytes: FILE_UPLOAD_MAX_BYTES,
    encryptionKey: invite.roomKey,
  });
const setup = (isCurrent = () => true) => {
  const stored = new Map<string, Uint8Array<ArrayBuffer>>();
  const backend = {
    authorize: vi.fn().mockResolvedValue("write"),
    upload: vi.fn(async (path: string, bytes: Uint8Array<ArrayBuffer>) => {
      stored.set(path, bytes);
    }),
    download: vi.fn(async (path: string) => stored.get(path) ?? null),
  };
  const handler = createFileHandler(backend, ["https://app.test"]);
  const invoke = vi.fn(async (_name: string, { body }: { body: unknown }) => {
    const response = await handler(
      new Request("https://gateway.test", {
        method: "POST",
        headers: {
          origin: "https://app.test",
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      }),
    );
    if (!response.ok) {
      return { data: null, error: new Error("TEST failed") };
    }
    return {
      data:
        response.headers.get("content-type") === "application/octet-stream"
          ? await response.blob()
          : await response.json(),
      error: null,
    };
  });
  const client = { functions: { invoke } } as unknown as SupabaseClient;
  return {
    backend,
    stored,
    invoke,
    files: createSupabaseFiles(client, invite, isCurrent),
    prefix: `/files/rooms/${invite.roomId}`,
  };
};
it("roundtrips actual upstream compressed AES bytes through the gateway", async () => {
  const { files, prefix, stored, invoke } = setup();
  expect(await files.saveFiles({ prefix, files: await fixture() })).toEqual({
    savedFiles: [id],
    erroredFiles: [],
  });
  expect(
    new TextDecoder().decode(stored.get(`${invite.roomId}/${id}`)),
  ).not.toContain("TEST-codec");
  const loaded = await files.loadFiles(prefix, invite.roomKey, [id, id]);
  expect(loaded.erroredFiles.size).toBe(0);
  expect(loaded.loadedFiles[0]).toMatchObject({
    id,
    dataURL,
    mimeType: "image/png",
  });
  expect(invoke).toHaveBeenCalledTimes(2);
  expect(invoke.mock.calls[0][1].body).not.toHaveProperty("roomKey");
});

it("rejects an encrypted compression bomb through the real file loader", async () => {
  const { files, prefix, stored } = setup();
  const payload = new TextEncoder().encode(
    `data:image/png;base64,${"A".repeat(8 * 1024 * 1024)}`,
  );
  const encoded = await compressData(payload, {
    encryptionKey: invite.roomKey,
    metadata: { id, mimeType: "image/png", created: 1 },
  });
  stored.set(`${invite.roomId}/${id}`, encoded);
  expect(encoded.byteLength).toBeLessThan(FILE_UPLOAD_MAX_BYTES);
  const result = await files.loadFiles(prefix, invite.roomKey, [id]);
  expect(result.loadedFiles).toEqual([]);
  expect(result.erroredFiles.get(id)).toBe(true);
});
it("keeps upload partial failures and permits retry", async () => {
  const { backend, files, prefix } = setup();
  const encoded = await fixture();
  const upload = backend.upload.getMockImplementation()!;
  let failed = false;
  backend.upload.mockImplementation(async (path, bytes) => {
    if (path.endsWith(`/${id}`) && !failed) {
      failed = true;
      throw new Error("TEST offline");
    }
    return upload(path, bytes);
  });
  expect(
    await files.saveFiles({
      prefix,
      files: [...encoded, { id: other, buffer: new Uint8Array([1]) }],
    }),
  ).toEqual({ savedFiles: [other], erroredFiles: [id] });
  expect(
    (await files.saveFiles({ prefix, files: encoded })).savedFiles,
  ).toEqual([id]);
});
it("restores bytes with a fresh client and reports missing files separately", async () => {
  const { files, prefix, invoke } = setup();
  await files.saveFiles({ prefix, files: await fixture() });
  const fresh = createSupabaseFiles(
    { functions: { invoke } } as unknown as SupabaseClient,
    invite,
    () => true,
  );
  const result = await fresh.loadFiles(prefix, invite.roomKey, [id, other]);
  expect(result.loadedFiles.map((file) => file.id)).toEqual([id]);
  expect(result.erroredFiles.get(other)).toBe(true);
});
it("rejects other rooms/keys before requesting", async () => {
  const { files, invoke } = setup();
  expect(
    (
      await files.loadFiles(
        "/files/rooms/sc_bbbbbbbbbbbbbbbbbbbb",
        invite.roomKey,
        [id],
      )
    ).erroredFiles.get(id),
  ).toBe(true);
  expect(
    (
      await files.loadFiles(
        `/files/rooms/${invite.roomId}`,
        await generateEncryptionKey(),
        [id],
      )
    ).erroredFiles.get(id),
  ).toBe(true);
  expect(invoke).not.toHaveBeenCalled();
});
it("rejects oversize and unsafe IDs before upload", async () => {
  const { files, prefix, invoke } = setup();
  const result = await files.saveFiles({
    prefix,
    files: [
      { id, buffer: new Uint8Array(FILE_UPLOAD_MAX_BYTES + 1) },
      { id: "../bad" as FileId, buffer: new Uint8Array([1]) },
    ],
  });
  expect(result.erroredFiles).toHaveLength(2);
  expect(invoke).not.toHaveBeenCalled();
});
it("rejects unexpected successful responses", async () => {
  const { files, prefix, invoke } = setup();
  invoke.mockResolvedValueOnce({ data: {}, error: null });
  expect(
    (await files.saveFiles({ prefix, files: await fixture() })).erroredFiles,
  ).toEqual([id]);
});
it("handles rejected transport without exposing diagnostics", async () => {
  const { files, prefix, invoke } = setup();
  invoke.mockRejectedValueOnce(new Error("TEST sensitive"));
  expect(
    (await files.loadFiles(prefix, invite.roomKey, [id])).erroredFiles.get(id),
  ).toBe(true);
});

it("rejects ciphertext moved under a different file ID", async () => {
  const { files, prefix, stored } = setup();
  await files.saveFiles({ prefix, files: await fixture() });
  stored.set(
    `${invite.roomId}/${other}`,
    stored.get(`${invite.roomId}/${id}`)!,
  );
  const loaded = await files.loadFiles(prefix, invite.roomKey, [other]);
  expect(loaded.loadedFiles).toEqual([]);
  expect(loaded.erroredFiles.get(other)).toBe(true);
});

it("accepts the controller's slashless load prefix", async () => {
  const { files, prefix } = setup();
  await files.saveFiles({ prefix, files: await fixture() });
  expect(
    (await files.loadFiles(prefix.slice(1), invite.roomKey, [id]))
      .loadedFiles[0].id,
  ).toBe(id);
});

it("does not return slow download results after the room generation changes", async () => {
  let current = true;
  const { files, prefix, backend } = setup(() => current);
  await files.saveFiles({ prefix, files: await fixture() });
  const download = backend.download.getMockImplementation()!;
  backend.download.mockImplementationOnce(async (path) => {
    current = false;
    return download(path);
  });
  await expect(
    files.loadFiles(prefix, invite.roomKey, [id]),
  ).rejects.toHaveProperty("name", "AbortError");
});
