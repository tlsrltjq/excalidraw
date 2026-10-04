import { MIME_TYPES } from "@excalidraw/common";
import { getNonDeletedElements, newImageElement } from "@excalidraw/element";
import { getDefaultAppState } from "@excalidraw/excalidraw/appState";
import { getDataURL, loadFromBlob } from "@excalidraw/excalidraw/data/blob";
import { encodePngMetadata } from "@excalidraw/excalidraw/data/image";
import { serializeAsJSON } from "@excalidraw/excalidraw/data/json";
import {
  restoreAppState,
  restoreElements,
} from "@excalidraw/excalidraw/data/restore";
import { exportToSvg } from "@excalidraw/excalidraw/scene/export";
import { API } from "@excalidraw/excalidraw/tests/helpers/api";

import type { FileId } from "@excalidraw/element/types";
import type { BinaryFiles } from "@excalidraw/excalidraw/types";

describe("image exports and standalone drawing recovery", () => {
  const state = { ...getDefaultAppState(), viewBackgroundColor: "#ffffff" };
  const fileId = "backup-test-image" as FileId;
  const elements = restoreElements(
    [
      newImageElement({
        type: "image",
        x: 10,
        y: 20,
        width: 100,
        height: 100,
        fileId,
      }),
    ],
    null,
    { repairBindings: true, deleteInvisibleElements: true },
  );
  let files: BinaryFiles;
  let png: File;

  beforeEach(async () => {
    png = await API.loadFile("./fixtures/smiley.png");
    files = {
      [fileId]: {
        id: fileId,
        dataURL: await getDataURL(png),
        mimeType: MIME_TYPES.png,
        created: 1,
      },
    };
  });

  const expectRecovered = (data: Awaited<ReturnType<typeof loadFromBlob>>) => {
    expect(data.elements).toEqual(elements);
    expect(data.files).toEqual(files);
    expect(data.appState.viewBackgroundColor).toBe(state.viewBackgroundColor);
  };

  it("backs up a Cloud database scene plus restored bytes without a server", async () => {
    const database = JSON.parse(
      serializeAsJSON(elements, state, files, "database"),
    );
    expect(database.files).toBeUndefined();
    const restoredElements = restoreElements(database.elements, null, {
      repairBindings: true,
      deleteInvisibleElements: true,
    });
    const restoredState = restoreAppState(database.appState, null);
    const backup = serializeAsJSON(
      restoredElements,
      restoredState,
      files,
      "local",
    );
    expectRecovered(
      await loadFromBlob(
        new Blob([backup], { type: MIME_TYPES.excalidraw }),
        null,
        null,
      ),
    );
  });

  it("includes only live referenced image files in a full drawing backup", () => {
    const unusedId = "other-drawing-image" as FileId;
    const backup = JSON.parse(
      serializeAsJSON(
        elements,
        state,
        { ...files, [unusedId]: { ...files[fileId], id: unusedId } },
        "local",
      ),
    );
    expect(Object.keys(backup.files)).toEqual([fileId]);
  });

  it("embeds image bytes in SVG without external Storage URLs", async () => {
    const svg = await exportToSvg(
      getNonDeletedElements(elements),
      state,
      files,
    );
    expect(svg.querySelector("image")?.getAttribute("href")).toBe(
      files[fileId].dataURL,
    );
    expect(svg.querySelectorAll("use")).toHaveLength(1);
    expect(Number(svg.getAttribute("width"))).toBeGreaterThan(0);
  });

  it("restores an image drawing from SVG with embedded editing data", async () => {
    const svg = await exportToSvg(
      getNonDeletedElements(elements),
      { ...state, exportEmbedScene: true },
      files,
    );
    expectRecovered(
      await loadFromBlob(
        new Blob([svg.outerHTML], { type: MIME_TYPES.svg }),
        null,
        null,
      ),
    );
  });

  it("restores image bytes from PNG editing metadata", async () => {
    // Real PNG fixture; canvas pixels are checked separately in Safari.
    const embedded = await encodePngMetadata({
      blob: png,
      metadata: serializeAsJSON(elements, state, files, "local"),
    });
    expectRecovered(await loadFromBlob(embedded, null, null));
  });

  it("does not mistake ordinary SVG/PNG exports for editable scene backups", async () => {
    const svg = await exportToSvg(
      getNonDeletedElements(elements),
      state,
      files,
    );
    await expect(
      loadFromBlob(
        new Blob([svg.outerHTML], { type: MIME_TYPES.svg }),
        null,
        null,
      ),
    ).rejects.toMatchObject({ code: "IMAGE_NOT_CONTAINS_SCENE_DATA" });
    await expect(loadFromBlob(png, null, null)).rejects.toMatchObject({
      code: "IMAGE_NOT_CONTAINS_SCENE_DATA",
    });
  });
});
