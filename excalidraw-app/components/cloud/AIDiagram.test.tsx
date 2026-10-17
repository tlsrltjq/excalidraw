import { StrictMode } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { getDefaultAppState } from "@excalidraw/excalidraw/appState";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { Provider, appJotaiStore } from "../../app-jotai";
import {
  connectLocalAI,
  generateLocalDiagram,
  editLocalLabels,
  extendLocalDiagram,
} from "../../ai/client";
import {
  selectedLabelTargets,
  createLabelPreview,
  applyLabelPreview,
} from "../../ai/labelEditor";
import {
  selectedStructureAnchor,
  createStructurePreview,
  applyStructurePreview,
} from "../../ai/structureEditor";
import {
  appendAIDiagram,
  createDiagramPreview,
  loadAIBackup,
} from "../../ai/editor";
import { currentDrawingAtom } from "../../cloud/currentDrawing";

import { AIDiagram, aiDiagramOpenAtom } from "./AIDiagram";

vi.mock("@excalidraw/excalidraw/components/Dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock("../../ai/client", () => ({
  connectLocalAI: vi.fn(),
  generateLocalDiagram: vi.fn(),
  editLocalLabels: vi.fn(),
  extendLocalDiagram: vi.fn(),
}));
vi.mock("../../ai/structureEditor", () => ({
  selectedStructureAnchor: vi.fn(),
  createStructurePreview: vi.fn(),
  applyStructurePreview: vi.fn(),
}));
vi.mock("../../ai/labelEditor", () => ({
  selectedLabelTargets: vi.fn(),
  createLabelPreview: vi.fn(),
  applyLabelPreview: vi.fn(),
}));
vi.mock("../../ai/editor", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../ai/editor")>()),
  createDiagramPreview: vi.fn(),
  appendAIDiagram: vi.fn(),
  loadAIBackup: vi.fn(),
}));

describe("AI preview controls", () => {
  const api = {
    getAppState: () => getDefaultAppState(),
    getFiles: () => ({}),
    getSceneElementsIncludingDeleted: () => [],
  } as unknown as ExcalidrawImperativeAPI;
  const mount = () =>
    render(
      <StrictMode>
        <Provider store={appJotaiStore}>
          <AIDiagram excalidrawAPI={api} />
        </Provider>
      </StrictMode>,
    );
  beforeEach(() => {
    vi.clearAllMocks();
    const anchor = {
      elementId: "private-source-id",
      context: {
        id: "s1" as const,
        label: "Authentication",
        kind: "decision" as const,
      },
    };
    vi.mocked(selectedStructureAnchor).mockReturnValue(anchor);
    vi.mocked(extendLocalDiagram).mockResolvedValue({
      version: 1,
      title: "Retry flow",
      direction: "TD",
      nodes: [{ id: "n1", label: "Retry", kind: "process" }],
      edges: [{ from: "s1", to: "n1", label: "" }],
    });
    vi.mocked(createStructurePreview).mockResolvedValue({
      elements: [],
      addedIds: ["new"],
      image: new Blob([], { type: "image/png" }),
      anchor,
      title: "Retry flow",
    });
    vi.mocked(selectedLabelTargets).mockReturnValue([
      { id: "t1", text: "Selected original", elementId: "private-real-id" },
    ]);
    vi.mocked(editLocalLabels).mockResolvedValue({
      version: 1,
      changes: [{ id: "t1", text: "Edited" }],
    });
    vi.mocked(createLabelPreview).mockResolvedValue({
      elements: [],
      selection: [],
      changes: [{ id: "t1", before: "Selected original", after: "Edited" }],
    });
    vi.spyOn(URL, "createObjectURL").mockReturnValue(
      "blob:synthetic-ai-preview",
    );
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.mocked(connectLocalAI).mockResolvedValue({
      token: "synthetic",
      models: ["local:tiny"],
    });
    vi.mocked(loadAIBackup).mockResolvedValue(null);
    vi.mocked(createDiagramPreview).mockResolvedValue({
      elements: [],
      image: new Blob([], { type: "image/png" }),
    });
    vi.mocked(generateLocalDiagram).mockResolvedValue({
      version: 1,
      title: "Synthetic flow",
      direction: "TD",
      nodes: [],
      edges: [],
    });
    appJotaiStore.set(aiDiagramOpenAtom, true);
  });
  afterEach(() => {
    cleanup();
    appJotaiStore.set(aiDiagramOpenAtom, false);
  });
  const start = async () => {
    await screen.findByRole("option", { name: "local:tiny" });
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Synthetic request" },
    });
    fireEvent.click(screen.getByRole("button", { name: "생성" }));
  };
  it("connects once in Strict Mode and requires explicit apply", async () => {
    mount();
    await start();
    await screen.findByAltText("Synthetic flow");
    expect(connectLocalAI).toHaveBeenCalledTimes(1);
    expect(appendAIDiagram).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "캔버스에 추가" }));
    await waitFor(() => expect(appendAIDiagram).toHaveBeenCalledTimes(1));
  });
  it("ignores a late response after cancellation", async () => {
    let complete!: (
      value: Awaited<ReturnType<typeof generateLocalDiagram>>,
    ) => void;
    vi.mocked(generateLocalDiagram).mockReturnValue(
      new Promise((resolve) => {
        complete = resolve;
      }),
    );
    mount();
    await start();
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    await act(async () =>
      complete({
        version: 1,
        title: "Late",
        direction: "TD",
        nodes: [],
        edges: [],
      }),
    );
    expect(createDiagramPreview).not.toHaveBeenCalled();
    expect(appendAIDiagram).not.toHaveBeenCalled();
  });
  it("invalidates the preview when the document generation changes", async () => {
    const original = appJotaiStore.get(currentDrawingAtom);
    mount();
    await start();
    await screen.findByAltText("Synthetic flow");
    act(() =>
      appJotaiStore.set(currentDrawingAtom, {
        ...original,
        generation: original.generation + 1,
      }),
    );
    expect(screen.queryByAltText("Synthetic flow")).toBeNull();
    expect(
      screen.getByRole("button", { name: "캔버스에 추가" }),
    ).toBeDisabled();
    act(() => appJotaiStore.set(currentDrawingAtom, original));
  });
  it("sends aliases only and previews label changes before explicit apply", async () => {
    mount();
    fireEvent.click(screen.getByRole("tab", { name: "선택 문구 수정" }));
    await start();
    await screen.findByRole("cell", { name: "Edited" });
    expect(editLocalLabels).toHaveBeenCalledWith(
      expect.anything(),
      "local:tiny",
      "Synthetic request",
      [{ id: "t1", text: "Selected original" }],
      expect.any(AbortSignal),
    );
    expect(generateLocalDiagram).not.toHaveBeenCalled();
    expect(applyLabelPreview).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "수정 적용" }));
    await waitFor(() => expect(applyLabelPreview).toHaveBeenCalledTimes(1));
    expect(appendAIDiagram).not.toHaveBeenCalled();
  });
  it("blocks editing when nothing with text is selected", async () => {
    vi.mocked(selectedLabelTargets).mockReturnValue([]);
    mount();
    fireEvent.click(screen.getByRole("tab", { name: "선택 문구 수정" }));
    await screen.findByRole("option", { name: "local:tiny" });
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Edit" },
    });
    expect(screen.getByRole("button", { name: "생성" })).toBeDisabled();
    expect(editLocalLabels).not.toHaveBeenCalled();
  });
  it("previews structure additions without sending real IDs or applying automatically", async () => {
    mount();
    fireEvent.click(screen.getByRole("tab", { name: "단계·연결 추가" }));
    await start();
    await screen.findByAltText("Retry flow");
    expect(extendLocalDiagram).toHaveBeenCalledWith(
      expect.anything(),
      "local:tiny",
      "Synthetic request",
      { id: "s1", label: "Authentication", kind: "decision" },
      expect.any(AbortSignal),
    );
    expect(applyStructurePreview).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "단계·연결 추가" }));
    await waitFor(() => expect(applyStructurePreview).toHaveBeenCalledTimes(1));
    expect(appendAIDiagram).not.toHaveBeenCalled();
    expect(applyLabelPreview).not.toHaveBeenCalled();
  });
  it("blocks additions without exactly one supported anchor", async () => {
    vi.mocked(selectedStructureAnchor).mockImplementation(() => {
      throw new Error("No anchor");
    });
    mount();
    fireEvent.click(screen.getByRole("tab", { name: "단계·연결 추가" }));
    await screen.findByRole("option", { name: "local:tiny" });
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Add retry" },
    });
    expect(screen.getByRole("button", { name: "생성" })).toBeDisabled();
    expect(extendLocalDiagram).not.toHaveBeenCalled();
  });
});
