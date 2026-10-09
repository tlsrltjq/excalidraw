import { act, cleanup, render, waitFor } from "@testing-library/react";
import { Excalidraw } from "@excalidraw/excalidraw";
import { getDefaultAppState } from "@excalidraw/excalidraw/appState";
import { serializeAsJSON } from "@excalidraw/excalidraw/data/json";
import { newElement } from "@excalidraw/element";
import { resolvablePromise } from "@excalidraw/common/utils";
import { StrictMode, useState } from "react";

import type {
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
} from "@excalidraw/excalidraw/types";

import { Provider, appJotaiStore } from "../../app-jotai";
import { clearAutosaveBaseline } from "../../cloud/autosave";
import {
  getCurrentDrawing,
  setCurrentDrawing,
} from "../../cloud/currentDrawing";
import { getDrawing } from "../../cloud/drawings";
import { cloudSessionAtom } from "../../cloud/session";

import { Dashboard, dashboardOpenAtom } from "./Dashboard";

import type { Session } from "@supabase/supabase-js";

vi.mock("../../cloud/supabaseClient", () => ({
  supabase: null,
  isCloudConfigured: true,
}));
vi.mock("../../cloud/drawings", () => ({
  getDrawing: vi.fn(),
  listDrawings: vi.fn().mockResolvedValue([]),
  updateDrawingScene: vi.fn(),
}));
vi.mock("../../cloud/localDraftStore", () => ({
  getLocalDraft: vi.fn().mockResolvedValue(null),
  saveLocalDraft: vi.fn().mockResolvedValue(undefined),
  clearLocalDraft: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../cloud/fileAdapter", () => ({
  createCloudFileManager: () => ({ saveFiles: vi.fn().mockResolvedValue({}) }),
}));

describe("Cloud URL opening with the real editor initialization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, "", "/?drawing=initialization-test");
    appJotaiStore.set(cloudSessionAtom, {
      status: "signed-in",
      session: { user: { id: "user-1" } } as Session,
    });
    appJotaiStore.set(dashboardOpenAtom, false);
    setCurrentDrawing(null);
    clearAutosaveBaseline();
  });

  afterEach(() => {
    cleanup();
    clearAutosaveBaseline();
    setCurrentDrawing(null);
  });

  it.each(["signed-in", "loading"] as const)(
    "waits for initialData with %s auth on mount",
    async (status) => {
      appJotaiStore.set(cloudSessionAtom, {
        status,
        session:
          status === "signed-in"
            ? ({ user: { id: "user-1" } } as Session)
            : null,
      });
      const initialData = resolvablePromise<ExcalidrawInitialDataState>();
      const remote = newElement({
        type: "rectangle",
        x: 20,
        y: 20,
        width: 100,
        height: 100,
      });
      vi.mocked(getDrawing).mockResolvedValue({
        id: "initialization-test",
        ownerId: "user-1",
        title: "Initialization test",
        createdAt: "2026-10-09T00:00:00Z",
        updatedAt: "2026-10-09T00:00:00Z",
        revision: 1,
        sceneData: JSON.parse(
          serializeAsJSON([remote], getDefaultAppState(), {}, "database"),
        ),
      });
      let editor: ExcalidrawImperativeAPI | null = null;
      const Harness = () => {
        const [api, setAPI] = useState<ExcalidrawImperativeAPI | null>(null);
        return (
          <>
            <Excalidraw
              initialData={initialData}
              onExcalidrawAPI={(nextAPI) => {
                editor = nextAPI;
                setAPI(nextAPI);
              }}
            />
            <Provider store={appJotaiStore}>
              <Dashboard excalidrawAPI={api} />
            </Provider>
          </>
        );
      };
      render(
        <StrictMode>
          <Harness />
        </StrictMode>,
      );
      await waitFor(() => expect(editor).not.toBeNull());
      await act(async () => {
        appJotaiStore.set(cloudSessionAtom, {
          status: "signed-in",
          session: { user: { id: "user-1" } } as Session,
        });
      });
      expect(editor!.getAppState().isLoading).toBe(true);
      expect(getDrawing).not.toHaveBeenCalled();
      expect(getCurrentDrawing().drawingId).toBeNull();

      await act(async () => {
        initialData.resolve({ elements: [] });
      });
      await waitFor(() =>
        expect(editor!.getSceneElements().map((element) => element.id)).toEqual(
          [remote.id],
        ),
      );
      expect(editor!.getAppState().isLoading).toBe(false);
      expect(getDrawing).toHaveBeenCalledTimes(1);
      expect(getCurrentDrawing().drawingId).toBe("initialization-test");
    },
  );
});
