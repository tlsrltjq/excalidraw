import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { getDefaultAppState } from "@excalidraw/excalidraw/appState";
import { serializeAsJSON } from "@excalidraw/excalidraw/data/json";
import { StrictMode } from "react";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { Provider, appJotaiStore } from "../../app-jotai";
import {
  clearAutosaveBaseline,
  flushAutosave,
  primeAutosaveBaseline,
  scheduleAutosave,
} from "../../cloud/autosave";
import {
  getCurrentDrawing,
  setCurrentDrawing,
} from "../../cloud/currentDrawing";
import {
  getDrawing,
  listDrawings,
  updateDrawingScene,
} from "../../cloud/drawings";
import { clearLocalDraft } from "../../cloud/localDraftStore";
import { cloudSessionAtom } from "../../cloud/session";
import {
  loadFolderWorkspace,
  moveDrawingToFolder,
  deleteFolder,
} from "../../cloud/folders";

import { Dashboard, dashboardOpenAtom } from "./Dashboard";
import { versionHistoryTargetAtom } from "./VersionHistory";

import type { ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";

import type { CloudDrawing } from "../../cloud/types";

vi.mock("../../cloud/supabaseClient", () => ({
  supabase: null,
  isCloudConfigured: true,
}));
vi.mock("../../cloud/folders", () => ({
  loadFolderWorkspace: vi.fn(),
  createFolder: vi.fn(),
  renameFolder: vi.fn(),
  deleteFolder: vi.fn(),
  moveDrawingToFolder: vi.fn(),
}));

vi.mock("../../cloud/drawings", () => ({
  getDrawing: vi.fn(),
  listDrawings: vi.fn(),
  updateDrawingScene: vi.fn(),
  createDrawing: vi.fn(),
  deleteDrawing: vi.fn(),
  renameDrawing: vi.fn(),
}));

vi.mock("../../cloud/localDraftStore", () => ({
  getLocalDraft: vi.fn().mockResolvedValue(null),
  saveLocalDraft: vi.fn().mockResolvedValue(undefined),
  clearLocalDraft: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../cloud/fileAdapter", () => ({
  createCloudFileManager: () => ({ saveFiles: vi.fn().mockResolvedValue({}) }),
}));

// Keep the real Dashboard and autosave logic, isolating only the editor's modal shell.
vi.mock("@excalidraw/excalidraw/components/Dialog", () => ({
  Dialog: ({ children, title }: { children: ReactNode; title: string }) => (
    <div role="dialog" aria-label={title}>
      {children}
    </div>
  ),
}));

const appState = getDefaultAppState();
const drawing: CloudDrawing = {
  id: "drawing-1",
  ownerId: "user-1",
  title: "Test drawing",
  createdAt: "2026-10-03T00:00:00Z",
  updatedAt: "2026-10-03T00:00:00Z",
  revision: 1,
  sceneData: JSON.parse(serializeAsJSON([], appState, {}, "database")),
};

const api = {
  updateScene: vi.fn(),
  addFiles: vi.fn(),
  getSceneElements: () => [],
  getAppState: () => appState,
  getFiles: () => ({}),
} as unknown as ExcalidrawImperativeAPI;

const renderDashboard = async () => {
  await act(async () => {
    render(
      <StrictMode>
        <Provider store={appJotaiStore}>
          <Dashboard excalidrawAPI={api} />
        </Provider>
      </StrictMode>,
    );
  });
};

describe("Dashboard Cloud URL loading", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.mocked(loadFolderWorkspace).mockResolvedValue({
      folders: [{ id: "folder-1", name: "Work" }],
      assignments: {},
    });
    vi.mocked(getDrawing).mockResolvedValue(null);
    vi.mocked(listDrawings).mockResolvedValue([]);
    window.history.replaceState({}, "", "/?drawing=drawing-1");
    appJotaiStore.set(cloudSessionAtom, {
      status: "signed-in",
      session: { user: { id: "user-1" } } as Session,
    });
    appJotaiStore.set(dashboardOpenAtom, false);
    appJotaiStore.set(versionHistoryTargetAtom, null);
    setCurrentDrawing(null);
    clearAutosaveBaseline();
  });

  afterEach(() => {
    cleanup();
    setCurrentDrawing(null);
    clearAutosaveBaseline();
    flushAutosave();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it.each(["not-found", "network-error"])(
    "detaches queued and future Cloud saves after %s without clearing the canvas or drafts",
    async (failure) => {
      setCurrentDrawing("previous-drawing");
      primeAutosaveBaseline("previous-drawing", 1, [], appState, {});
      const editedState = { ...appState, viewBackgroundColor: "#f8f9fa" };
      scheduleAutosave([], editedState, {});
      if (failure === "network-error") {
        vi.mocked(getDrawing).mockRejectedValue(
          new Error("Network unavailable"),
        );
      }

      await renderDashboard();

      expect(screen.getByRole("alert")).toHaveTextContent(
        "Cloud 자동 저장 연결은 해제했습니다",
      );
      expect(getCurrentDrawing().drawingId).toBeNull();
      expect(api.updateScene).not.toHaveBeenCalled();
      expect(getDrawing).toHaveBeenCalledTimes(1);

      scheduleAutosave([], editedState, {});
      await act(async () => {
        vi.advanceTimersByTime(2500);
        flushAutosave();
      });
      expect(updateDrawingScene).not.toHaveBeenCalled();
      expect(clearLocalDraft).not.toHaveBeenCalled();
    },
  );

  it("opens a valid URL once under Strict Mode and keeps autosave working", async () => {
    vi.mocked(getDrawing).mockResolvedValue(drawing);
    vi.mocked(updateDrawingScene).mockResolvedValue({
      status: "ok",
      revision: 2,
      updatedAt: drawing.updatedAt,
    });
    await renderDashboard();
    expect(getDrawing).toHaveBeenCalledTimes(1);
    expect(api.updateScene).toHaveBeenCalledTimes(1);
    expect(getCurrentDrawing().drawingId).toBe(drawing.id);
    expect(screen.queryByRole("alert")).toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(1);
      scheduleAutosave([], { ...appState, viewBackgroundColor: "#f8f9fa" }, {});
      vi.advanceTimersByTime(2500);
    });
    expect(updateDrawingScene).toHaveBeenCalledWith(
      drawing.id,
      expect.any(Object),
      drawing.revision,
    );
  });

  it.each(["account-change", "drawing-reopen"])(
    "ignores a delayed URL response after %s",
    async (change) => {
      let resolveDrawing!: (value: CloudDrawing) => void;
      vi.mocked(getDrawing).mockReturnValue(
        new Promise<CloudDrawing>((resolve) => {
          resolveDrawing = resolve;
        }),
      );
      await renderDashboard();

      await act(async () => {
        if (change === "account-change") {
          appJotaiStore.set(cloudSessionAtom, {
            status: "signed-out",
            session: null,
          });
        } else {
          setCurrentDrawing(drawing.id);
        }
        resolveDrawing(drawing);
      });

      expect(api.updateScene).not.toHaveBeenCalled();
      expect(screen.queryByRole("alert")).toBeNull();
      expect(appJotaiStore.get(dashboardOpenAtom)).toBe(false);
    },
  );

  it("closes the Dashboard when opening version history", async () => {
    window.history.replaceState({}, "", "/");
    appJotaiStore.set(dashboardOpenAtom, true);
    vi.mocked(listDrawings).mockResolvedValue([drawing]);
    await renderDashboard();

    fireEvent.click(screen.getByRole("button", { name: "버전 기록" }));

    expect(screen.queryByRole("dialog", { name: "내 그림" })).toBeNull();
    expect(appJotaiStore.get(versionHistoryTargetAtom)).toEqual({
      drawingId: drawing.id,
      title: drawing.title,
    });
  });

  it("filters by folder and title, and moves without changing the scene", async () => {
    window.history.replaceState({}, "", "/");
    appJotaiStore.set(dashboardOpenAtom, true);
    vi.mocked(listDrawings).mockResolvedValue([
      drawing,
      { ...drawing, id: "drawing-2", title: "Notes" },
    ]);
    vi.mocked(loadFolderWorkspace).mockResolvedValue({
      folders: [{ id: "folder-1", name: "Work" }],
      assignments: { "drawing-1": "folder-1" },
    });
    await renderDashboard();
    fireEvent.change(screen.getByLabelText("폴더 선택"), {
      target: { value: "folder-1" },
    });
    expect(screen.queryByRole("button", { name: "Notes" })).toBeNull();
    fireEvent.change(screen.getByLabelText("그림 제목 검색"), {
      target: { value: "nothing" },
    });
    expect(screen.getByText("표시할 그림이 없습니다.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("그림 제목 검색"), {
      target: { value: "TEST" },
    });
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Test drawing 폴더 이동"), {
        target: { value: "" },
      });
    });
    expect(moveDrawingToFolder).toHaveBeenCalledWith(drawing.id, null);
    expect(api.updateScene).not.toHaveBeenCalled();
  });

  it("deletes a folder without deleting drawings", async () => {
    window.history.replaceState({}, "", "/");
    appJotaiStore.set(dashboardOpenAtom, true);
    vi.mocked(listDrawings).mockResolvedValue([drawing]);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    await renderDashboard();
    fireEvent.change(screen.getByLabelText("폴더 선택"), {
      target: { value: "folder-1" },
    });
    await act(async () => {
      fireEvent.click(screen.getByLabelText("폴더 삭제"));
    });
    expect(deleteFolder).toHaveBeenCalledWith("folder-1");
    expect(screen.getByLabelText("폴더 선택")).toHaveValue("unfiled");
    expect(api.updateScene).not.toHaveBeenCalled();
    confirm.mockRestore();
  });

  it("keeps drawing access when the folder schema is unavailable", async () => {
    window.history.replaceState({}, "", "/");
    appJotaiStore.set(dashboardOpenAtom, true);
    vi.mocked(listDrawings).mockResolvedValue([drawing]);
    vi.mocked(loadFolderWorkspace).mockRejectedValue(
      new Error("schema unavailable"),
    );
    await renderDashboard();
    expect(
      screen.getByRole("button", { name: drawing.title }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("새 폴더")).toBeDisabled();
  });
});
