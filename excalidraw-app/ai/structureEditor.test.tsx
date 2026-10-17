import {
  Excalidraw,
  convertToExcalidrawElements,
} from "@excalidraw/excalidraw";
import {
  isArrowElement,
  newElementWith,
  LinearElementEditor,
} from "@excalidraw/element";
import { act, render } from "@excalidraw/excalidraw/tests/test-utils";
import { Keyboard } from "@excalidraw/excalidraw/tests/helpers/ui";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { captureCanvas, createDiagramElements } from "./editor";
import {
  applyStructurePreview,
  createStructurePreview,
  selectedStructureAnchor,
} from "./structureEditor";

import type { DiagramExtension } from "./schema";

vi.mock("@excalidraw/excalidraw", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@excalidraw/excalidraw")>()),
  exportToBlob: vi.fn().mockResolvedValue(new Blob([], { type: "image/png" })),
}));
vi.mock("./editor", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./editor")>()),
  createDiagramElements: vi.fn(),
}));

describe("add steps without replacing the actual canvas", () => {
  let api: ExcalidrawImperativeAPI;
  const plan: DiagramExtension = {
    version: 1,
    title: "Retry",
    direction: "TD",
    nodes: [{ id: "n1", label: "Retry", kind: "process" }],
    edges: [{ from: "s1", to: "n1", label: "Failure" }],
  };
  beforeEach(async () => {
    vi.mocked(createDiagramElements).mockImplementation(async (diagram) =>
      convertToExcalidrawElements(
        diagram.nodes.map((node, i) => ({
          id: `node_${node.id}`,
          type:
            node.kind === "decision"
              ? "diamond"
              : node.kind === "terminal"
              ? "ellipse"
              : "rectangle",
          x: 0,
          y: i * 180,
          width: 180,
          height: 100,
          label: { text: node.label },
        })),
        { regenerateIds: false },
      ),
    );
    await render(
      <Excalidraw
        handleKeyboardGlobally
        onMount={({ excalidrawAPI }) => {
          api = excalidrawAPI;
        }}
        initialData={{
          elements: convertToExcalidrawElements(
            [
              {
                id: "source",
                type: "rectangle",
                x: 0,
                y: 0,
                width: 180,
                height: 100,
                label: { text: "Authentication" },
              },
              {
                id: "outside",
                type: "ellipse",
                x: 400,
                y: 300,
                width: 120,
                height: 100,
              },
            ],
            { regenerateIds: false },
          ),
        }}
      />,
    );
    act(() =>
      api.updateScene({ appState: { selectedElementIds: { source: true } } }),
    );
  });
  const preview = () =>
    createStructurePreview(api, plan, selectedStructureAnchor(api));
  it("previews immutable additions with reciprocal bindings and preserves old geometry", async () => {
    const snapshot = captureCanvas(api);
    const original = api.getSceneElements();
    const result = await preview();
    expect(captureCanvas(api)).toEqual(snapshot);
    expect(result.elements.find((el) => el.id === "outside")).toBe(
      original.find((el) => el.id === "outside"),
    );
    const source = result.elements.find((el) => el.id === "source")!;
    expect([
      source.x,
      source.y,
      source.width,
      source.height,
      source.angle,
      source.index,
    ]).toEqual([0, 0, 180, 100, 0, original[0].index]);
    const arrow = result.elements.filter(isArrowElement)[0];
    expect(arrow.startBinding?.elementId).toBe("source");
    expect(source.boundElements).toContainEqual({
      id: arrow.id,
      type: "arrow",
    });
    const target = result.elements.find(
      (el) => el.id === arrow.endBinding?.elementId,
    )!;
    expect(target.x).toBeGreaterThan(520);
    expect(target.boundElements).toContainEqual({
      id: arrow.id,
      type: "arrow",
    });
    expect(new Set(result.elements.map((el) => el.id)).size).toBe(
      result.elements.length,
    );
  });
  it("applies and undoes/redoes the whole addition once", async () => {
    const baseline = captureCanvas(api);
    const originalIds = api.getSceneElements().map((el) => el.id);
    const result = await preview();
    await act(async () =>
      applyStructurePreview(
        api,
        result,
        baseline,
        () => true,
        vi.fn().mockResolvedValue(undefined),
      ),
    );
    expect(api.getSceneElements().length).toBe(result.elements.length);
    act(() => Keyboard.undo());
    expect(api.getSceneElements().map((el) => el.id)).toEqual(originalIds);
    expect(
      api
        .getSceneElements()
        .find((el) => el.id === "source")
        ?.boundElements?.some((bound) => bound.type === "arrow"),
    ).toBe(false);
    act(() => Keyboard.redo());
    expect(api.getSceneElements().filter(isArrowElement)).toHaveLength(1);
  });
  it("keeps the arrow attached when the existing source moves", async () => {
    const result = await preview();
    await act(async () =>
      applyStructurePreview(
        api,
        result,
        captureCanvas(api),
        () => true,
        vi.fn().mockResolvedValue(undefined),
      ),
    );
    const arrow = api.getSceneElements().filter(isArrowElement)[0];
    const before = LinearElementEditor.getPointAtIndexGlobalCoordinates(
      arrow,
      0,
      new Map(api.getSceneElements().map((el) => [el.id, el])),
    );
    act(() =>
      api.updateScene({ appState: { selectedElementIds: { source: true } } }),
    );
    act(() => Keyboard.keyPress("ArrowRight"));
    const updated = api.getSceneElements().filter(isArrowElement)[0];
    const after = LinearElementEditor.getPointAtIndexGlobalCoordinates(
      updated,
      0,
      new Map(api.getSceneElements().map((el) => [el.id, el])),
    );
    expect(after[0]).toBeGreaterThan(before[0]);
    expect(updated.startBinding?.elementId).toBe("source");
  });
  it("blocks failed backup and identity/selection/scene changes", async () => {
    const baseline = captureCanvas(api);
    const result = await preview();
    await expect(
      applyStructurePreview(
        api,
        result,
        baseline,
        () => true,
        async () => {
          throw new Error("Quota");
        },
      ),
    ).rejects.toThrow();
    await expect(
      applyStructurePreview(api, result, baseline, () => false, vi.fn()),
    ).rejects.toThrow();
    expect(captureCanvas(api)).toEqual(baseline);
    await expect(
      applyStructurePreview(
        api,
        result,
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
    act(() =>
      api.updateScene({
        appState: { selectedElementIds: { source: true } },
        elements: api
          .getSceneElements()
          .map((el) =>
            el.id === "outside" ? newElementWith(el, { x: 600 }) : el,
          ),
      }),
    );
    await expect(
      applyStructurePreview(api, result, baseline, () => true, vi.fn()),
    ).rejects.toThrow();
  });
  it("rejects multiple, locked and view-only targets", async () => {
    act(() =>
      api.updateScene({
        appState: { selectedElementIds: { source: true, outside: true } },
      }),
    );
    expect(() => selectedStructureAnchor(api)).toThrow();
    act(() =>
      api.updateScene({ appState: { selectedElementIds: { source: true } } }),
    );
    const result = await preview();
    const baseline = captureCanvas(api);
    act(() => api.updateScene({ appState: { viewModeEnabled: true } }));
    await expect(
      applyStructurePreview(api, result, baseline, () => true, vi.fn()),
    ).rejects.toThrow();
  });
});
