import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { getDefaultAppState } from "@excalidraw/excalidraw/appState";
import { serializeAsJSON } from "@excalidraw/excalidraw/data/json";
import { restoreElements } from "@excalidraw/excalidraw/data/restore";
import { newImageElement } from "@excalidraw/element";

import type {
  BinaryFileData,
  BinaryFiles,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/element/types";

import { Provider, appJotaiStore } from "../app-jotai";
import { FileManager } from "../data/FileManager";
import { CloudSaveStatus } from "../components/cloud/CloudSaveStatus";

import {
  clearAutosaveBaseline,
  flushAutosave,
  isAutosavePaused,
  localDraftErrorAtom,
  localDraftPromptAtom,
  primeAutosaveBaseline,
  saveStatusAtom,
  scheduleAutosave,
} from "./autosave";
import { setCurrentDrawing } from "./currentDrawing";
import {
  clearLocalDraft,
  getLocalDraft,
  saveLocalDraft,
} from "./localDraftStore";
import * as draftStore from "./localDraftStore";
import { openCloudDrawing } from "./openDrawing";

import type { CloudDrawing } from "./types";

const mocks = vi.hoisted(() => ({ upload: vi.fn(), download: vi.fn() }));
vi.mock("./supabaseClient", () => ({
  supabase: null,
  isCloudConfigured: true,
}));
vi.mock("./drawings", () => ({
  updateDrawingScene: vi.fn().mockResolvedValue({
    status: "ok",
    revision: 2,
    updatedAt: "2026-10-04T00:00:00Z",
  }),
  getDrawing: vi.fn(),
  createDrawing: vi.fn(),
}));
vi.mock("./fileAdapter", () => ({
  createCloudFileManager: () =>
    new FileManager({ getFiles: mocks.download, saveFiles: mocks.upload }),
}));

const state = getDefaultAppState();
const file: BinaryFileData = {
  id: "recovery-image" as BinaryFileData["id"],
  mimeType: "image/png",
  dataURL: "data:image/png;base64,dGVzdA==" as BinaryFileData["dataURL"],
  created: 1,
};
const image = restoreElements(
  [
    newImageElement({
      type: "image",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      fileId: file.id,
    }),
  ],
  null,
  { repairBindings: true, deleteInvisibleElements: true },
)[0];
const drawing: CloudDrawing = {
  id: "recovery-drawing",
  ownerId: "test-user",
  title: "Recovery test",
  revision: 2,
  createdAt: "2026-10-04T00:00:00Z",
  updatedAt: "2026-10-04T00:00:00Z",
  sceneData: JSON.parse(serializeAsJSON([image], state, {}, "database")),
};
let editorElements: readonly ExcalidrawElement[] = [];
let editorFiles: BinaryFiles = {};
let editorState = state;
const api = {
  updateScene: vi.fn((data) => {
    editorElements = data.elements ?? editorElements;
    editorState = data.appState ?? editorState;
  }),
  addFiles: vi.fn((files: BinaryFileData[]) => {
    files.forEach((value) => {
      editorFiles[value.id] = value;
    });
  }),
  getSceneElements: () => editorElements,
  getAppState: () => editorState,
  getFiles: () => editorFiles,
} as unknown as ExcalidrawImperativeAPI;

describe("image draft recovery across editor reloads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    editorElements = [];
    editorFiles = {};
    editorState = state;
    appJotaiStore.set(localDraftPromptAtom, null);
    mocks.download.mockResolvedValue({
      loadedFiles: [],
      erroredFiles: new Map([[file.id, true]]),
    });
    mocks.upload.mockImplementation(async ({ addedFiles }) => ({
      savedFiles: addedFiles,
      erroredFiles: new Map(),
    }));
  });

  afterEach(async () => {
    cleanup();
    clearAutosaveBaseline();
    setCurrentDrawing(null);
    flushAutosave();
    appJotaiStore.set(localDraftPromptAtom, null);
    await clearLocalDraft(drawing.id);
    vi.restoreAllMocks();
  });

  it("restores missing bytes after failed upload even when server JSON matches", async () => {
    setCurrentDrawing(drawing.id);
    primeAutosaveBaseline(drawing.id, 1, [], state, {});
    mocks.upload.mockImplementationOnce(async ({ addedFiles }) => ({
      savedFiles: new Map(),
      erroredFiles: addedFiles,
    }));
    scheduleAutosave([image], state, { [file.id]: file });
    flushAutosave();
    await waitFor(() =>
      expect(appJotaiStore.get(saveStatusAtom).status).toBe("file-error"),
    );
    expect((await getLocalDraft(drawing.id))?.files?.[file.id]).toEqual(file);

    clearAutosaveBaseline();
    editorFiles = {};
    await openCloudDrawing(api, drawing);
    expect(appJotaiStore.get(localDraftPromptAtom)?.files?.[file.id]).toEqual(
      file,
    );
    expect(editorFiles).toEqual({});
    render(
      <Provider store={appJotaiStore}>
        <CloudSaveStatus excalidrawAPI={api} />
      </Provider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "로컬 변경 사용" }));
    await waitFor(() =>
      expect(appJotaiStore.get(saveStatusAtom).status).toBe("saved"),
    );
    expect(editorFiles[file.id]).toEqual(file);
    expect(mocks.upload).toHaveBeenCalledTimes(2);
    expect(await getLocalDraft(drawing.id)).toBeUndefined();
  });

  it("does not prompt for a fully synchronized image draft", async () => {
    await saveLocalDraft(drawing.id, [image], state, { [file.id]: file });
    mocks.download.mockResolvedValue({
      loadedFiles: [file],
      erroredFiles: new Map(),
    });
    await openCloudDrawing(api, drawing);
    expect(appJotaiStore.get(localDraftPromptAtom)).toBeNull();
    expect(editorFiles[file.id]).toEqual(file);
  });

  it("still offers legacy scene-only drafts without inventing image data", async () => {
    await saveLocalDraft(drawing.id, [], state);
    await openCloudDrawing(api, drawing);
    expect(appJotaiStore.get(localDraftPromptAtom)?.elements).toEqual([]);
    expect(appJotaiStore.get(localDraftPromptAtom)?.files).toEqual({});
  });

  it("a stale image response cannot affect a reopened drawing or its lock", async () => {
    let finish!: (value: {
      loadedFiles: BinaryFileData[];
      erroredFiles: Map<BinaryFileData["id"], true>;
    }) => void;
    mocks.download.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const first = openCloudDrawing(api, drawing);
    await waitFor(() => expect(mocks.download).toHaveBeenCalledTimes(1));
    await openCloudDrawing(api, {
      ...drawing,
      sceneData: JSON.parse(serializeAsJSON([], state, {}, "database")),
    });
    expect(isAutosavePaused()).toBe(false);
    finish({ loadedFiles: [file], erroredFiles: new Map() });
    await first;
    expect(editorFiles).toEqual({});
    expect(appJotaiStore.get(localDraftPromptAtom)).toBeNull();
  });

  it("does not schedule a replacement draft when IndexedDB read fails", async () => {
    vi.spyOn(draftStore, "getLocalDraft").mockRejectedValueOnce(
      new Error("IndexedDB unavailable"),
    );
    await openCloudDrawing(api, drawing);
    expect(appJotaiStore.get(localDraftErrorAtom)).not.toBeNull();
    expect(isAutosavePaused()).toBe(false);
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("ignores a draft read that completes after the same drawing is reopened", async () => {
    let finish!: (value: Awaited<ReturnType<typeof getLocalDraft>>) => void;
    vi.spyOn(draftStore, "getLocalDraft").mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const first = openCloudDrawing(api, drawing);
    await openCloudDrawing(api, {
      ...drawing,
      sceneData: JSON.parse(serializeAsJSON([], state, {}, "database")),
    });
    finish({
      elements: [image],
      appState: state,
      files: { [file.id]: file },
      savedAt: 1,
    });
    await first;
    expect(appJotaiStore.get(localDraftPromptAtom)).toBeNull();
    expect(editorElements).toEqual([]);
    expect(isAutosavePaused()).toBe(false);
  });

  it("releases the load lock when the editor rejects a scene update", () => {
    vi.mocked(api.updateScene).mockImplementationOnce(() => {
      throw new Error("Editor unavailable");
    });
    expect(() => openCloudDrawing(api, drawing)).toThrow("Editor unavailable");
    expect(isAutosavePaused()).toBe(false);
  });
});
