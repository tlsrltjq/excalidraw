import {
  Excalidraw,
  convertToExcalidrawElements,
} from "@excalidraw/excalidraw";
import { act } from "@testing-library/react";
import { render } from "@excalidraw/excalidraw/tests/test-utils";
import { Keyboard } from "@excalidraw/excalidraw/tests/helpers/ui";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { FileId } from "@excalidraw/element/types";

import {
  appendAIDiagram,
  captureCanvas,
  loadAIBackup,
  saveAIBackup,
} from "./editor";

describe("AI explicit append", () => {
  let api: ExcalidrawImperativeAPI;
  const generated = () =>
    convertToExcalidrawElements([
      { type: "rectangle", x: 0, y: 0, width: 100, height: 80 },
    ]);
  beforeEach(async () => {
    await render(
      <Excalidraw
        handleKeyboardGlobally
        onMount={({ excalidrawAPI }) => {
          api = excalidrawAPI;
        }}
        initialData={{ elements: generated() }}
      />,
    );
  });
  it("preserves existing elements, appends to the right and undoes in one step", async () => {
    const original = api.getSceneElements()[0];
    const baseline = captureCanvas(api);
    const backup = vi.fn().mockResolvedValue(undefined);
    await act(async () =>
      appendAIDiagram(api, generated(), baseline, () => true, backup),
    );
    expect(backup).toHaveBeenCalledTimes(1);
    expect(api.getSceneElements()).toHaveLength(2);
    expect(api.getSceneElements()[0]).toEqual(original);
    expect(api.getSceneElements()[1].x).toBeGreaterThan(
      original.x + original.width,
    );
    act(() => Keyboard.undo());
    expect(api.getSceneElements().map((el) => el.id)).toEqual([original.id]);
  });
  it("does not modify the canvas when the backup fails", async () => {
    const baseline = captureCanvas(api);
    await expect(
      appendAIDiagram(
        api,
        generated(),
        baseline,
        () => true,
        async () => {
          throw new Error("Quota");
        },
      ),
    ).rejects.toThrow();
    expect(captureCanvas(api)).toEqual(baseline);
  });
  it("checks document identity again after the asynchronous backup", async () => {
    const baseline = captureCanvas(api);
    let current = true;
    await expect(
      appendAIDiagram(
        api,
        generated(),
        baseline,
        () => current,
        async () => {
          current = false;
        },
      ),
    ).rejects.toThrow();
    expect(captureCanvas(api)).toEqual(baseline);
  });
  it("rejects changed scenes and read-only mode before writing a backup", async () => {
    const baseline = captureCanvas(api);
    act(() => api.updateScene({ elements: generated() }));
    const backup = vi.fn();
    await expect(
      appendAIDiagram(api, generated(), baseline, () => true, backup),
    ).rejects.toThrow();
    act(() => api.updateScene({ appState: { viewModeEnabled: true } }));
    await expect(
      appendAIDiagram(api, generated(), captureCanvas(api), () => true, backup),
    ).rejects.toThrow();
    expect(backup).not.toHaveBeenCalled();
  });
  it("round-trips an isolated local recovery file with binary bytes", async () => {
    const file = {
      id: "synthetic-image",
      mimeType: "image/png",
      dataURL: "data:image/png;base64,dGVzdA==",
      created: 1,
    } as const;
    act(() => {
      api.addFiles([file as never]);
      api.updateScene({
        elements: convertToExcalidrawElements([
          {
            type: "image",
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            fileId: file.id as FileId,
          },
        ]),
      });
    });
    const snapshot = captureCanvas(api);
    await saveAIBackup("synthetic-ai-account/doc", snapshot);
    const restored = JSON.parse(
      (await loadAIBackup("synthetic-ai-account/doc"))!,
    );
    expect(restored.elements[0].id).toBe(api.getSceneElements()[0].id);
    expect(restored.files[file.id]).toEqual(file);
    expect(await loadAIBackup("synthetic-other-account/doc")).toBeNull();
  });
});
