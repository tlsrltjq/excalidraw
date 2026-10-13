import { beforeEach, describe, expect, it, vi } from "vitest";

import type { FileId } from "@excalidraw/element/types";
import type { AppState } from "@excalidraw/excalidraw/types";
import type { RemoteExcalidrawElement } from "@excalidraw/excalidraw/data/reconcile";

import {
  isSavedToFirebase,
  loadFilesFromFirebase,
  loadFromFirebase,
  saveFilesToFirebase,
  saveToFirebase,
} from "../../data/firebase";

import { firebaseCollabPersistence } from "./firebase";

import { collabPersistence } from ".";

import type Portal from "../Portal";
import type { SyncableExcalidrawElement } from "../../data";

vi.mock("../../data/firebase", () => ({
  isSavedToFirebase: vi.fn(),
  loadFilesFromFirebase: vi.fn(),
  loadFromFirebase: vi.fn(),
  saveFilesToFirebase: vi.fn(),
  saveToFirebase: vi.fn(),
}));

describe("Firebase collaboration persistence adapter", () => {
  const portal = {} as Portal;
  const appState = {} as AppState;
  const elements: readonly SyncableExcalidrawElement[] = [];
  const fileId = "TEST-file" as FileId;

  beforeEach(() => vi.resetAllMocks());

  it("keeps Firebase as the default without changing implementation functions", () => {
    expect(collabPersistence).toBe(firebaseCollabPersistence);
    expect(collabPersistence.isSaved).toBe(isSavedToFirebase);
    expect(collabPersistence.saveScene).toBe(saveToFirebase);
    expect(collabPersistence.loadScene).toBe(loadFromFirebase);
    expect(collabPersistence.saveFiles).toBe(saveFilesToFirebase);
    expect(collabPersistence.loadFiles).toBe(loadFilesFromFirebase);
  });

  it("preserves the synchronous unsaved-state check", () => {
    vi.mocked(isSavedToFirebase).mockReturnValue(false);
    expect(collabPersistence.isSaved(portal, elements)).toBe(false);
    expect(isSavedToFirebase).toHaveBeenCalledWith(portal, elements);
  });

  it("forwards scene save arguments and the exact result promise", async () => {
    const storedElements: RemoteExcalidrawElement[] = [];
    const result = Promise.resolve(storedElements);
    vi.mocked(saveToFirebase).mockReturnValue(result);
    expect(collabPersistence.saveScene(portal, elements, appState)).toBe(
      result,
    );
    expect(saveToFirebase).toHaveBeenCalledWith(portal, elements, appState);
    expect(await result).toBe(storedElements);
  });

  it("preserves missing scenes and the nullable socket", async () => {
    vi.mocked(loadFromFirebase).mockResolvedValue(null);
    expect(
      await collabPersistence.loadScene("TEST-room", "TEST-key", null),
    ).toBeNull();
    expect(loadFromFirebase).toHaveBeenCalledWith(
      "TEST-room",
      "TEST-key",
      null,
    );
  });

  it("passes encoded file bytes and partial failures through unchanged", async () => {
    const input = {
      prefix: "files/rooms/TEST-room",
      files: [{ id: fileId, buffer: new Uint8Array([1, 2, 3]) }],
    };
    const partial = { savedFiles: [], erroredFiles: [fileId] };
    vi.mocked(saveFilesToFirebase).mockResolvedValue(partial);
    expect(await collabPersistence.saveFiles(input)).toBe(partial);
    expect(saveFilesToFirebase).toHaveBeenCalledWith(input);
    expect(vi.mocked(saveFilesToFirebase).mock.calls[0][0]).toBe(input);
  });

  it("preserves downloaded file results and error maps", async () => {
    const ids = [fileId];
    const result = {
      loadedFiles: [],
      erroredFiles: new Map([[fileId, true as const]]),
    };
    vi.mocked(loadFilesFromFirebase).mockResolvedValue(result);
    expect(
      await collabPersistence.loadFiles(
        "files/rooms/TEST-room",
        "TEST-key",
        ids,
      ),
    ).toBe(result);
    expect(loadFilesFromFirebase).toHaveBeenCalledWith(
      "files/rooms/TEST-room",
      "TEST-key",
      ids,
    );
  });

  it("does not convert scene rejection into success or retry another backend", async () => {
    const error = new Error("TEST scene write failure");
    vi.mocked(saveToFirebase).mockRejectedValue(error);
    await expect(
      collabPersistence.saveScene(portal, elements, appState),
    ).rejects.toBe(error);
    expect(saveToFirebase).toHaveBeenCalledTimes(1);
  });

  it("does not swallow file transport failures", async () => {
    const error = new Error("TEST file read failure");
    vi.mocked(loadFilesFromFirebase).mockRejectedValue(error);
    await expect(
      collabPersistence.loadFiles("files/rooms/TEST-room", "TEST-key", [
        fileId,
      ]),
    ).rejects.toBe(error);
    expect(loadFilesFromFirebase).toHaveBeenCalledTimes(1);
  });
});
