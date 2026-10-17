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
import { connectLocalAI, generateLocalDiagram } from "../../ai/client";
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
});
