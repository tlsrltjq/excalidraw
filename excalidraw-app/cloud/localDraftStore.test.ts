import { getDefaultAppState } from "@excalidraw/excalidraw/appState";
import { newImageElement } from "@excalidraw/element";
import { createStore, set } from "idb-keyval";

import type { BinaryFileData } from "@excalidraw/excalidraw/types";

import {
  clearLocalDraft,
  getLocalDraft,
  saveLocalDraft,
} from "./localDraftStore";

const state = getDefaultAppState();
const file: BinaryFileData = {
  id: "draft-image" as BinaryFileData["id"],
  mimeType: "image/png",
  dataURL: "data:image/png;base64,dGVzdA==" as BinaryFileData["dataURL"],
  created: 1,
};
const image = newImageElement({
  type: "image",
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  fileId: file.id,
});

describe("document-local image drafts (real IndexedDB)", () => {
  afterEach(async () => {
    await clearLocalDraft("draft-a");
    await clearLocalDraft("draft-b");
  });

  it("atomically preserves the scene and referenced image bytes", async () => {
    await saveLocalDraft(
      "draft-a",
      [image],
      state,
      { [file.id]: file },
      "snapshot-a",
    );
    const draft = await getLocalDraft("draft-a");
    expect(draft?.elements).toEqual([image]);
    expect(draft?.files?.[file.id]).toEqual(file);
    expect(draft?.token).toBe("snapshot-a");
  });

  it("does not copy unrelated files into a drawing's draft", async () => {
    await saveLocalDraft("draft-a", [], state, { [file.id]: file });
    expect((await getLocalDraft("draft-a"))?.files).toEqual({});
  });

  it("keeps drawings independent and retains bytes needed by deleted images", async () => {
    await saveLocalDraft("draft-a", [{ ...image, isDeleted: true }], state, {
      [file.id]: file,
    });
    await saveLocalDraft("draft-b", [], state);
    await clearLocalDraft("draft-b");
    expect((await getLocalDraft("draft-a"))?.files?.[file.id]).toEqual(file);
    expect(await getLocalDraft("draft-b")).toBeUndefined();
  });

  it("reads legacy records without file or token fields", async () => {
    const store = createStore("personal-cloud-drafts-db", "drafts-store");
    await set(
      "draft-a",
      { elements: [image], appState: state, savedAt: 1 },
      store,
    );
    expect((await getLocalDraft("draft-a"))?.files).toBeUndefined();
    expect((await getLocalDraft("draft-a"))?.elements).toEqual([image]);
  });

  it("an older completion cannot remove a newer tab's draft", async () => {
    await saveLocalDraft("draft-a", [], state, {}, "older");
    await saveLocalDraft(
      "draft-a",
      [image],
      state,
      { [file.id]: file },
      "newer",
    );
    await clearLocalDraft("draft-a", "older");
    expect((await getLocalDraft("draft-a"))?.token).toBe("newer");
    await clearLocalDraft("draft-a", "newer");
    expect(await getLocalDraft("draft-a")).toBeUndefined();
  });
});
