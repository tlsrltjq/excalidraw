import {
  convertToExcalidrawElements,
  Excalidraw,
} from "@excalidraw/excalidraw";
import { isTextElement, newElementWith } from "@excalidraw/element";
import { act, render } from "@excalidraw/excalidraw/tests/test-utils";
import { Keyboard } from "@excalidraw/excalidraw/tests/helpers/ui";
import { pointFrom } from "@excalidraw/math";

import type { LocalPoint } from "@excalidraw/math";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { captureCanvas } from "./editor";
import {
  applyLabelPreview,
  createLabelPreview,
  selectedLabelTargets,
} from "./labelEditor";

describe("selected text edits in the actual editor", () => {
  let api: ExcalidrawImperativeAPI;
  beforeEach(async () => {
    const elements = convertToExcalidrawElements(
      [
        {
          id: "box",
          type: "rectangle",
          x: 0,
          y: 0,
          width: 200,
          height: 120,
          label: { text: "Original label" },
        },
        {
          id: "outside",
          type: "text",
          x: 400,
          y: 0,
          text: "Unselected original",
        },
      ],
      { regenerateIds: false },
    );
    await render(
      <Excalidraw
        handleKeyboardGlobally
        onMount={({ excalidrawAPI }) => {
          api = excalidrawAPI;
        }}
        initialData={{
          elements,
          appState: { selectedElementIds: { box: true } },
        }}
      />,
    );
  });
  const preview = (text = "New") =>
    createLabelPreview(
      api,
      { version: 1, changes: [{ id: "t1", text }] },
      selectedLabelTargets(api),
    );
  it("selects a container's label, preserves geometry/bindings/unselected text, and undo/redoes once", async () => {
    const original = api.getSceneElementsIncludingDeleted();
    const baseline = captureCanvas(api);
    expect(selectedLabelTargets(api).map((target) => target.text)).toEqual([
      "Original label",
    ]);
    const plan = await preview();
    expect(captureCanvas(api)).toEqual(baseline);
    expect(plan.elements.find((el) => el.id === "box")).toBe(
      original.find((el) => el.id === "box"),
    );
    expect(plan.elements.find((el) => el.id === "outside")).toBe(
      original.find((el) => el.id === "outside"),
    );
    const before = original.find(
      (el) => isTextElement(el) && el.containerId === "box",
    )!;
    const after = plan.elements.find((el) => el.id === before.id)!;
    expect(after.id).toBe(before.id);
    expect(after.boundElements).toEqual(before.boundElements);
    const backup = vi.fn().mockResolvedValue(undefined);
    await act(async () =>
      applyLabelPreview(api, plan, baseline, () => true, backup),
    );
    expect(backup).toHaveBeenCalledTimes(1);
    expect(
      api
        .getSceneElements()
        .filter(isTextElement)
        .some((el) => el.originalText === "New"),
    ).toBe(true);
    act(() => Keyboard.undo());
    expect(
      api
        .getSceneElements()
        .filter(isTextElement)
        .some((el) => el.originalText === "Original label"),
    ).toBe(true);
    act(() => Keyboard.redo());
    expect(
      api
        .getSceneElements()
        .filter(isTextElement)
        .some((el) => el.originalText === "New"),
    ).toBe(true);
  });
  it("fits longer text without changing its container and rejects text too large to fit", async () => {
    const plan = await preview("A somewhat longer label");
    const text = plan.elements
      .filter(isTextElement)
      .find((el) => el.containerId === "box")!;
    expect(text.width).toBeLessThanOrEqual(190.1);
    expect(text.height).toBeLessThanOrEqual(110.1);
    expect(text.fontSize).toBeGreaterThanOrEqual(12);
    act(() =>
      api.updateScene({
        elements: api
          .getSceneElementsIncludingDeleted()
          .map((el) =>
            el.id === "box" ? newElementWith(el, { height: 30 }) : el,
          ),
      }),
    );
    await expect(preview("W".repeat(120))).rejects.toThrow();
  });
  it("rejects selection changes while backing up", async () => {
    const baseline = captureCanvas(api);
    const plan = await preview();
    await expect(
      applyLabelPreview(
        api,
        plan,
        baseline,
        () => true,
        async () => {
          act(() =>
            api.updateScene({
              appState: { selectedElementIds: { outside: true } },
            }),
          );
        },
      ),
    ).rejects.toThrow();
    expect(captureCanvas(api).scene).toBe(baseline.scene);
  });
  it("leaves the canvas unchanged on failed backup and stale document", async () => {
    const baseline = captureCanvas(api);
    const plan = await preview();
    await expect(
      applyLabelPreview(
        api,
        plan,
        baseline,
        () => true,
        async () => {
          throw new Error("Quota");
        },
      ),
    ).rejects.toThrow();
    await expect(
      applyLabelPreview(api, plan, baseline, () => false, vi.fn()),
    ).rejects.toThrow();
    expect(captureCanvas(api)).toEqual(baseline);
  });
  it("updates a selected free text but never edits outside the request allowlist", async () => {
    act(() =>
      api.updateScene({ appState: { selectedElementIds: { outside: true } } }),
    );
    const selection = selectedLabelTargets(api);
    expect(selection[0].elementId).toBe("outside");
    const plan = await preview("Short");
    expect(plan.changes).toEqual([
      { id: "t1", before: "Unselected original", after: "Short" },
    ]);
    await expect(
      createLabelPreview(
        api,
        { version: 1, changes: [{ id: "t2", text: "Other" }] },
        selection,
      ),
    ).rejects.toThrow();
  });
  it("preserves a labelled arrow's points and endpoint bindings", async () => {
    const elements = convertToExcalidrawElements(
      [
        { id: "left", type: "rectangle", x: 0, y: 0, width: 100, height: 100 },
        { id: "right", type: "ellipse", x: 400, y: 0, width: 100, height: 100 },
        {
          id: "link",
          type: "arrow",
          x: 100,
          y: 50,
          points: [pointFrom<LocalPoint>(0, 0), pointFrom<LocalPoint>(300, 0)],
          start: { id: "left" },
          end: { id: "right" },
          label: { text: "Request" },
        },
      ],
      { regenerateIds: false },
    );
    act(() =>
      api.updateScene({
        elements,
        appState: { selectedElementIds: { link: true } },
      }),
    );
    const before = api.getSceneElements().find((el) => el.id === "link")!;
    const plan = await preview("Send");
    expect(plan.elements.find((el) => el.id === "link")).toBe(before);
    expect(
      plan.elements
        .filter(isTextElement)
        .find((el) => el.containerId === "link")?.originalText,
    ).toBe("Send");
  });
  it("rejects stale scenes, locked elements and view-only changes", async () => {
    const selection = selectedLabelTargets(api);
    const baseline = captureCanvas(api);
    const plan = await preview();
    act(() => api.updateScene({ appState: { viewModeEnabled: true } }));
    await expect(
      applyLabelPreview(api, plan, baseline, () => true, vi.fn()),
    ).rejects.toThrow();
    act(() =>
      api.updateScene({
        appState: { viewModeEnabled: false },
        elements: api
          .getSceneElements()
          .map((el) =>
            el.id === "box" ? newElementWith(el, { locked: true }) : el,
          ),
      }),
    );
    await expect(
      createLabelPreview(
        api,
        { version: 1, changes: [{ id: "t1", text: "New" }] },
        selection,
      ),
    ).rejects.toThrow();
    await expect(
      applyLabelPreview(api, plan, baseline, () => true, vi.fn()),
    ).rejects.toThrow();
  });
});
