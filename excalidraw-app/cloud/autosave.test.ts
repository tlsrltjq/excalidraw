import { getDefaultAppState } from "@excalidraw/excalidraw/appState";
import { newImageElement } from "@excalidraw/element";

import type { BinaryFileData, BinaryFiles } from "@excalidraw/excalidraw/types";

import { appJotaiStore } from "../app-jotai";
import { FileManager } from "../data/FileManager";

import {
  clearAutosaveBaseline,
  flushAutosave,
  primeAutosaveBaseline,
  saveStatusAtom,
  scheduleAutosave,
  localDraftErrorAtom,
  shouldPreventCloudUnload,
} from "./autosave";
import { setCurrentDrawing } from "./currentDrawing";
import { updateDrawingScene } from "./drawings";
import { clearLocalDraft, saveLocalDraft } from "./localDraftStore";

const mocks = vi.hoisted(() => ({ upload: vi.fn() }));
vi.mock("./supabaseClient", () => ({ isCloudConfigured: true }));
vi.mock("./drawings", () => ({ updateDrawingScene: vi.fn() }));
vi.mock("./localDraftStore", () => ({
  saveLocalDraft: vi.fn().mockResolvedValue(undefined),
  clearLocalDraft: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("./fileAdapter", () => ({
  createCloudFileManager: () =>
    new FileManager({
      getFiles: async () => ({ loadedFiles: [], erroredFiles: new Map() }),
      saveFiles: mocks.upload,
    }),
}));

const appState = getDefaultAppState();
const image = newImageElement({
  type: "image",
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  fileId: "test-image" as BinaryFileData["id"],
});
const file: BinaryFileData = {
  id: image.fileId!,
  mimeType: "image/png",
  dataURL: "data:image/png;base64,dGVzdA==" as BinaryFileData["dataURL"],
  created: 1,
};
const files: BinaryFiles = { [file.id]: file };
const success = () => ({
  savedFiles: new Map([[file.id, file]]),
  erroredFiles: new Map(),
});
const settle = async () => {
  for (let i = 0; i < 20; i++) {
    await Promise.resolve();
  }
};
const save = async (state = appState) => {
  scheduleAutosave([image], state, files);
  flushAutosave();
  await settle();
};

describe("Cloud scene and file autosave", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.mocked(updateDrawingScene).mockResolvedValue({
      status: "ok",
      revision: 2,
      updatedAt: "2026-10-03T00:00:00Z",
    });
    mocks.upload.mockResolvedValue(success());
    setCurrentDrawing("drawing-1");
    primeAutosaveBaseline("drawing-1", 1, [], appState, {});
  });

  afterEach(async () => {
    clearAutosaveBaseline();
    setCurrentDrawing(null);
    flushAutosave();
    await settle();
    vi.useRealTimers();
  });

  it("waits for binary upload before saved status and draft deletion", async () => {
    let finish!: (value: ReturnType<typeof success>) => void;
    mocks.upload.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    await save();
    expect(appJotaiStore.get(saveStatusAtom).status).toBe("uploading");
    expect(clearLocalDraft).not.toHaveBeenCalled();
    finish(success());
    await settle();
    expect(appJotaiStore.get(saveStatusAtom).status).toBe("saved");
    expect(clearLocalDraft).toHaveBeenCalledWith(
      "drawing-1",
      expect.any(String),
    );
  });

  it("preserves draft on partial failure and retries without another scene update", async () => {
    mocks.upload.mockResolvedValueOnce({
      savedFiles: new Map(),
      erroredFiles: new Map([[file.id, file]]),
    });
    await save();
    expect(appJotaiStore.get(saveStatusAtom).status).toBe("file-error");
    expect(clearLocalDraft).not.toHaveBeenCalled();
    await save();
    expect(updateDrawingScene).toHaveBeenCalledTimes(1);
    expect(appJotaiStore.get(saveStatusAtom).status).toBe("saved");
  });

  it("handles rejected upload promises", async () => {
    mocks.upload.mockRejectedValueOnce(new Error("Upload unavailable"));
    await save();
    expect(appJotaiStore.get(saveStatusAtom).status).toBe("file-error");
    expect(clearLocalDraft).not.toHaveBeenCalled();
  });

  it("reports missing image data instead of claiming a complete save", async () => {
    scheduleAutosave([image], appState, {});
    flushAutosave();
    await settle();
    expect(appJotaiStore.get(saveStatusAtom).status).toBe("file-error");
    expect(clearLocalDraft).not.toHaveBeenCalled();
  });

  it("clears a redundant draft from a no-op callback after a completed save", async () => {
    await save();
    vi.mocked(clearLocalDraft).mockClear();
    await save();
    expect(updateDrawingScene).toHaveBeenCalledTimes(1);
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    expect(clearLocalDraft).toHaveBeenCalledWith(
      "drawing-1",
      expect.any(String),
    );
  });

  it("uploads images even if the adopted scene equals the baseline", async () => {
    primeAutosaveBaseline("drawing-1", 1, [image], appState, files);
    await save();
    expect(updateDrawingScene).not.toHaveBeenCalled();
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    expect(appJotaiStore.get(saveStatusAtom).status).toBe("saved");
  });

  it("ignores an upload response after the same drawing is reopened", async () => {
    let finish!: (value: ReturnType<typeof success>) => void;
    mocks.upload.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    await save();
    setCurrentDrawing("drawing-1");
    primeAutosaveBaseline("drawing-1", 2, [], appState, {});
    finish(success());
    await settle();
    expect(appJotaiStore.get(saveStatusAtom).status).toBe("idle");
    expect(clearLocalDraft).not.toHaveBeenCalled();
  });

  it("queues later edits until upload completes and saves the latest revision", async () => {
    let finish!: (value: ReturnType<typeof success>) => void;
    mocks.upload.mockReturnValueOnce(
      new Promise((resolve) => (finish = resolve)),
    );
    await save();
    const changed = { ...appState, viewBackgroundColor: "#eeeeee" };
    await save(changed);
    expect(updateDrawingScene).toHaveBeenCalledTimes(1);
    expect(clearLocalDraft).not.toHaveBeenCalled();
    finish(success());
    await settle();
    expect(updateDrawingScene).toHaveBeenCalledTimes(2);
    expect(vi.mocked(updateDrawingScene).mock.calls[1][2]).toBe(2);
    expect(appJotaiStore.get(saveStatusAtom).status).toBe("saved");
  });

  it("does not upload files or clear drafts on scene revision conflict", async () => {
    vi.mocked(updateDrawingScene).mockResolvedValue({ status: "conflict" });
    await save();
    expect(appJotaiStore.get(saveStatusAtom).status).toBe("conflict");
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(clearLocalDraft).not.toHaveBeenCalled();
  });

  it("does not clear the draft when offline", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValueOnce(false);
    mocks.upload.mockRejectedValueOnce(new Error("Offline"));
    await save();
    expect(appJotaiStore.get(saveStatusAtom).status).toBe("offline");
    expect(clearLocalDraft).not.toHaveBeenCalled();
  });

  it("waits for local persistence and warns before unload during that write", async () => {
    let finish!: () => void;
    vi.mocked(saveLocalDraft).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    await save();
    expect(shouldPreventCloudUnload()).toBe(true);
    expect(updateDrawingScene).not.toHaveBeenCalled();
    finish();
    await settle();
    expect(appJotaiStore.get(saveStatusAtom).status).toBe("saved");
    expect(shouldPreventCloudUnload()).toBe(false);
  });

  it("surfaces local quota failure and recovers on retry", async () => {
    vi.mocked(saveLocalDraft).mockRejectedValueOnce(
      new Error("QuotaExceededError"),
    );
    mocks.upload.mockRejectedValueOnce(new Error("Offline"));
    await save();
    expect(appJotaiStore.get(localDraftErrorAtom)).not.toBeNull();
    expect(shouldPreventCloudUnload()).toBe(true);
    await save();
    expect(appJotaiStore.get(localDraftErrorAtom)).toBeNull();
    expect(appJotaiStore.get(saveStatusAtom).status).toBe("saved");
  });
});
