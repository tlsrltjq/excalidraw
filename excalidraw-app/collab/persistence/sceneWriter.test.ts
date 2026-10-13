import { webcrypto } from "node:crypto";

import { getDefaultAppState } from "@excalidraw/excalidraw/appState";
import {
  decryptData,
  generateEncryptionKey,
} from "@excalidraw/excalidraw/data/encryption";
import { restoreElements } from "@excalidraw/excalidraw/data/restore";
import { API } from "@excalidraw/excalidraw/tests/helpers/api";
import { newElementWith } from "@excalidraw/element";

import { getSyncableElements } from "../../data";

import {
  CollabSceneConflictError,
  createEncryptedSceneWriter,
} from "./sceneWriter";

import type { EncryptedSceneStore } from "./sceneWriter";

type Record = NonNullable<Awaited<ReturnType<EncryptedSceneStore["read"]>>>;
const roomId = `sc_${"a".repeat(20)}`;
const state = {
  ...getDefaultAppState(),
  width: 1000,
  height: 800,
  offsetTop: 0,
  offsetLeft: 0,
};
const element = (id: string) =>
  getSyncableElements(restoreElements([API.createElement({ id })], null));
let roomKey: string;

beforeEach(async () => {
  vi.stubGlobal("crypto", webcrypto);
  vi.spyOn(Date, "now").mockReturnValue(1);
  roomKey = await generateEncryptionKey();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const memoryStore = () => {
  const records = new Map<string, Record>();
  const store: EncryptedSceneStore = {
    read: vi.fn<EncryptedSceneStore["read"]>(
      async (id) => records.get(id) ?? null,
    ),
    compareAndSwap: vi.fn<EncryptedSceneStore["compareAndSwap"]>(
      async (id, expected, scene) => {
        const old = records.get(id);
        if ((old?.revision ?? null) !== expected) {
          return { status: "conflict" };
        }
        const revision = (old?.revision ?? 0) + 1;
        records.set(id, { ...scene, revision });
        return { status: "saved", revision };
      },
    ),
  };
  return { store, records };
};
const input = (id: string) => ({
  roomId,
  roomKey,
  elements: element(id),
  appState: state,
  isCurrent: () => true,
});

it("stores encrypted bytes and restores element identity without mutating the input", async () => {
  const { store, records } = memoryStore();
  const request = input("TEST-shape");
  const before = JSON.stringify(request.elements);
  const saved = await createEncryptedSceneWriter(store)(request);
  expect(saved.revision).toBe(1);
  expect(saved.elements[0].id).toBe("TEST-shape");
  expect(JSON.stringify(request.elements)).toBe(before);
  const encrypted = records.get(roomId)!;
  expect(new TextDecoder().decode(encrypted.ciphertext)).not.toContain(
    "TEST-shape",
  );
  const decoded = await decryptData(
    encrypted.iv,
    encrypted.ciphertext,
    roomKey,
  );
  expect(JSON.parse(new TextDecoder().decode(decoded))[0].id).toBe(
    "TEST-shape",
  );
});

it("re-reads and reconciles when two independent clients race on the same revision", async () => {
  const { store, records } = memoryStore();
  const a = createEncryptedSceneWriter(store);
  const b = createEncryptedSceneWriter(store);
  await Promise.all([a(input("TEST-a")), b(input("TEST-b"))]);
  const record = records.get(roomId)!;
  const decoded = await decryptData(record.iv, record.ciphertext, roomKey);
  expect(
    JSON.parse(new TextDecoder().decode(decoded))
      .map((e: { id: string }) => e.id)
      .sort(),
  ).toEqual(["TEST-a", "TEST-b"]);
  expect(record.revision).toBe(2);
  expect(store.compareAndSwap).toHaveBeenCalledTimes(3);
});

it("serializes same-room writes and allows another room to proceed", async () => {
  const { store } = memoryStore();
  const read = store.read;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started!: () => void;
  const entered = new Promise<void>((resolve) => {
    started = resolve;
  });
  vi.mocked(store.read).mockImplementationOnce(async () => {
    started();
    await gate;
    return null;
  });
  const write = createEncryptedSceneWriter(store);
  const first = write(input("TEST-a"));
  await entered;
  const second = write(input("TEST-b"));
  await write({ ...input("TEST-other"), roomId: `sc_${"b".repeat(20)}` });
  expect(read).toHaveBeenCalledTimes(2);
  release();
  await Promise.all([first, second]);
  expect(read).toHaveBeenCalledTimes(3);
});

it("preserves a deletion when an old local snapshot is reconciled", async () => {
  const { store } = memoryStore();
  const write = createEncryptedSceneWriter(store);
  const request = input("TEST-deleted");
  await write(request);
  const deleted = getSyncableElements(
    restoreElements(
      [newElementWith(request.elements[0], { isDeleted: true })],
      null,
    ),
  );
  await write({ ...request, elements: deleted });
  const result = await write(request);
  expect(result.elements.find((e) => e.id === "TEST-deleted")?.isDeleted).toBe(
    true,
  );
});

it("limits revision conflicts instead of force-overwriting", async () => {
  const { store } = memoryStore();
  vi.mocked(store.compareAndSwap).mockResolvedValue({ status: "conflict" });
  await expect(
    createEncryptedSceneWriter(store)(input("TEST")),
  ).rejects.toBeInstanceOf(CollabSceneConflictError);
  expect(store.read).toHaveBeenCalledTimes(3);
  expect(store.compareAndSwap).toHaveBeenCalledTimes(3);
});

it("does not write after a stale slow read and can save after the aborted operation", async () => {
  const { store } = memoryStore();
  let current = true;
  vi.mocked(store.read).mockImplementationOnce(async () => {
    current = false;
    return null;
  });
  const write = createEncryptedSceneWriter(store);
  await expect(
    write({ ...input("TEST-old"), isCurrent: () => current }),
  ).rejects.toHaveProperty("name", "AbortError");
  expect(store.compareAndSwap).not.toHaveBeenCalled();
  await expect(write(input("TEST-new"))).resolves.toHaveProperty("revision", 1);
});

it("rejects stale write results instead of returning them for editor application", async () => {
  const { store } = memoryStore();
  let current = true;
  vi.mocked(store.compareAndSwap).mockImplementationOnce(async () => {
    current = false;
    return { status: "saved", revision: 1 };
  });
  await expect(
    createEncryptedSceneWriter(store)({
      ...input("TEST-stale"),
      isCurrent: () => current,
    }),
  ).rejects.toHaveProperty("name", "AbortError");
});

it("propagates offline errors and does not poison the queue", async () => {
  const { store } = memoryStore();
  const error = new Error("TEST offline");
  vi.mocked(store.read).mockRejectedValueOnce(error);
  const write = createEncryptedSceneWriter(store);
  await expect(write(input("TEST-failed"))).rejects.toBe(error);
  await expect(write(input("TEST-retry"))).resolves.toHaveProperty(
    "revision",
    1,
  );
});

it("rejects a wrong decryption key before writing", async () => {
  const { store } = memoryStore();
  const write = createEncryptedSceneWriter(store);
  await write(input("TEST-original"));
  const wrongKey = await generateEncryptionKey();
  await expect(
    write({ ...input("TEST-other"), roomKey: wrongKey }),
  ).rejects.toThrow();
  expect(store.compareAndSwap).toHaveBeenCalledTimes(1);
});

it("rejects malformed encrypted records before writing", async () => {
  const { store } = memoryStore();
  vi.mocked(store.read).mockResolvedValue({
    revision: 1,
    sceneVersion: 1,
    iv: new Uint8Array(2),
    ciphertext: new ArrayBuffer(16),
  });
  await expect(
    createEncryptedSceneWriter(store)(input("TEST")),
  ).rejects.toThrow("Invalid encrypted collaboration scene");
  expect(store.compareAndSwap).not.toHaveBeenCalled();
});

it("does not report an invalid returned revision as a saved result", async () => {
  const { store } = memoryStore();
  vi.mocked(store.compareAndSwap).mockResolvedValue({
    status: "saved",
    revision: 99,
  });
  await expect(
    createEncryptedSceneWriter(store)(input("TEST")),
  ).rejects.toThrow("Invalid collaboration revision");
});
