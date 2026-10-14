import { act, waitFor } from "@testing-library/react";
import { encryptData } from "@excalidraw/excalidraw/data/encryption";
import { API } from "@excalidraw/excalidraw/tests/helpers/api";
import { render } from "@excalidraw/excalidraw/tests/test-utils";

import type { FileId } from "@excalidraw/element/types";

import type { DataURL } from "@excalidraw/excalidraw/types";

import ExcalidrawApp from "../App";
import { appJotaiStore } from "../app-jotai";
import { cloudSessionAtom } from "../cloud/session";
import { getCurrentDrawing, setCurrentDrawing } from "../cloud/currentDrawing";
import { isCollaboratingAtom } from "../collab/Collab";
import {
  inviteConnectionAtom,
  inviteViewModeAtom,
} from "../collab/persistence/inviteState";
import { WS_SUBTYPES } from "../app_constants";
import { getSyncableElements } from "../data";

import type { createRelaySession } from "../collab/persistence/relaySession";

const mocks = vi.hoisted(() => ({
  sessions: [] as Parameters<typeof createRelaySession>[0][],
  sockets: [] as any[],
  writable: false,
  load: vi.fn(),
  save: vi.fn(),
  legacySave: vi.fn(),
  provider: vi.fn(),
}));
vi.mock("../collab/persistence/admission", () => ({
  getCollabParticipantClient: () => ({}),
  checkCollabInvitation: vi.fn().mockResolvedValue("write"),
  signInForCollabInvite: vi.fn(),
}));
vi.mock("../collab/persistence/relayTicketRequest", () => ({
  createRelayTicketRequest: () => vi.fn(),
}));
vi.mock("../collab/persistence/relaySession", () => ({
  createRelaySession: (options: Parameters<typeof createRelaySession>[0]) => {
    mocks.sessions.push(options);
    return {
      canWrite: () => mocks.writable,
      isReady: () => mocks.writable,
      close: () => {
        mocks.writable = false;
        options.socket.disconnect();
      },
    };
  },
}));
vi.mock("../collab/persistence/supabase", () => ({
  createSupabaseCollabPersistence: (options: unknown) => {
    mocks.provider(options);
    return {
      loadScene: mocks.load,
      saveScene: mocks.save,
      isSaved: () => true,
      loadFiles: vi
        .fn()
        .mockResolvedValue({ loadedFiles: [], erroredFiles: new Map() }),
      saveFiles: vi
        .fn()
        .mockResolvedValue({ savedFiles: [], erroredFiles: [] }),
    };
  },
}));
vi.mock("../data/firebase", () => ({
  saveToFirebase: mocks.legacySave,
  loadFromFirebase: vi.fn().mockResolvedValue(null),
  isSavedToFirebase: () => true,
  saveFilesToFirebase: vi
    .fn()
    .mockResolvedValue({ savedFiles: [], erroredFiles: [] }),
  loadFilesFromFirebase: vi
    .fn()
    .mockResolvedValue({ loadedFiles: [], erroredFiles: new Map() }),
}));
vi.mock("socket.io-client", () => ({
  default: () => {
    const listeners = new Map<string, Set<(...args: any[]) => void>>();
    const socket = {
      id: "TEST-socket",
      connected: false,
      on: vi.fn((name, fn) => {
        if (!listeners.has(name)) {
          listeners.set(name, new Set());
        }
        listeners.get(name)!.add(fn);
      }),
      off: vi.fn((name, fn) => listeners.get(name)?.delete(fn)),
      emit: vi.fn(),
      connect: vi.fn(() => {
        socket.connected = true;
      }),
      close: vi.fn(() => {
        socket.connected = false;
      }),
      disconnect: vi.fn(() => {
        socket.connected = false;
      }),
      server: (name: string, ...args: unknown[]) => {
        for (const fn of listeners.get(name) ?? []) {
          fn(...args);
        }
      },
    };
    mocks.sockets.push(socket);
    return socket;
  },
}));
const route =
  "/?collabStorage=supabase&invite=00000000-0000-4000-8000-000000000001#room=sc_aaaaaaaaaaaaaaaaaaaa,AAAAAAAAAAAAAAAAAAAAAA";
beforeEach(() => {
  vi.stubEnv("VITE_COLLAB_SUPABASE_ENABLED", "true");
  mocks.sessions.length = 0;
  mocks.sockets.length = 0;
  mocks.writable = false;
  vi.clearAllMocks();
  mocks.load.mockResolvedValue([API.createElement({ id: "TEST-remote" })]);
  mocks.save.mockResolvedValue(null);
  mocks.legacySave.mockResolvedValue(null);
  history.replaceState({}, "", "/");
  appJotaiStore.set(cloudSessionAtom, { status: "signed-out", session: null });
});
afterEach(() => {
  act(() => {
    window.collab?.stopCollaboration(false);
    appJotaiStore.set(isCollaboratingAtom, false);
    appJotaiStore.set(inviteConnectionAtom, null);
    appJotaiStore.set(inviteViewModeAtom, null);
    setCurrentDrawing(null);
  });
  vi.unstubAllEnvs();
  history.replaceState({}, "", "/");
});
const setup = async () => {
  await render(<ExcalidrawApp />);
  act(() => API.setElements([API.createElement({ id: "TEST-original" })]));
  history.replaceState({}, "", route);
  const collab = window.collab;
  let operation!: Promise<void>;
  await act(async () => {
    operation = collab.startInvitation("guest", () => true);
  });
  // Register a rejection handler before tests deliberately cancel admission.
  const result = operation.then(
    () => "ready",
    (error) => error,
  );
  await waitFor(() => expect(mocks.sessions).toHaveLength(1));
  return {
    collab,
    result,
    session: mocks.sessions[0],
    socket: mocks.sockets[0],
  };
};
const authorize = async (
  t: Awaited<ReturnType<typeof setup>>,
  scope: "read" | "write" = "write",
) => {
  await act(async () => {
    t.session.onPending();
    await t.session.onReady(scope, () => true);
    mocks.writable = scope === "write";
  });
};
it("keeps original scene before ACK and while the remote snapshot is pending", async () => {
  let finish!: (value: unknown) => void;
  mocks.load.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const t = await setup();
  expect(window.h.elements[0].id).toBe("TEST-original");
  expect(t.collab.canWrite()).toBe(false);
  act(() =>
    t.collab.excalidrawAPI.updateScene({
      appState: { viewModeEnabled: false },
    }),
  );
  expect(window.h.state.viewModeEnabled).toBe(true);
  expect(window.h.state.viewModeEnabled).toBe(true);
  let ready!: Promise<void>;
  await act(async () => {
    t.session.onPending();
    ready = Promise.resolve(t.session.onReady("write", () => true));
  });
  expect(window.h.elements[0].id).toBe("TEST-original");
  await act(async () => {
    finish([API.createElement({ id: "TEST-remote" })]);
    await ready;
    mocks.writable = true;
  });
  expect(await t.result).toBe("ready");
  expect(window.h.elements.map((element) => element.id)).toEqual([
    "TEST-remote",
  ]);
  expect(t.collab.canWrite()).toBe(true);
  expect(window.h.state.viewModeEnabled).toBe(false);
  expect(mocks.legacySave).not.toHaveBeenCalled();
});
it("canceling pending admission preserves the personal drawing identity and scene", async () => {
  const t = await setup();
  act(() => setCurrentDrawing("TEST-drawing"));
  await act(async () => t.collab.cancelInvitationConnection());
  expect((await t.result).name).toBe("AbortError");
  expect(window.h.elements[0].id).toBe("TEST-original");
  expect(getCurrentDrawing().drawingId).toBe("TEST-drawing");
  expect(window.h.state.viewModeEnabled).toBe(false);
  expect(t.collab.isCollaborating()).toBe(false);
});
it("snapshot failure does not empty the canvas or invoke Firebase fallback", async () => {
  const t = await setup();
  mocks.load.mockRejectedValueOnce(new Error("TEST-sensitive"));
  await act(async () => {
    await expect(t.session.onReady("write", () => true)).rejects.toThrow();
    t.session.onError("협업 준비 실패");
  });
  expect(window.h.elements[0].id).toBe("TEST-original");
  expect((await t.result).message).toBe("협업 준비 실패");
  expect(mocks.legacySave).not.toHaveBeenCalled();
});
it("read-only admission locks editor/save/broadcast and does not warn on exit", async () => {
  const t = await setup();
  await authorize(t, "read");
  expect(window.h.state.viewModeEnabled).toBe(true);
  expect(t.collab.canWrite()).toBe(false);
  await act(async () => {
    t.collab.syncElements(t.collab.getSceneElementsIncludingDeleted());
    await t.collab.saveCollabRoomToFirebase(
      getSyncableElements(t.collab.getSceneElementsIncludingDeleted()),
    );
    await t.collab.portal.broadcastScene(
      WS_SUBTYPES.UPDATE,
      t.collab.getSceneElementsIncludingDeleted(),
      true,
    );
  });
  expect(mocks.save).not.toHaveBeenCalled();
  expect(t.socket.emit).not.toHaveBeenCalled();
  const event = new Event("beforeunload", { cancelable: true });
  act(() => window.dispatchEvent(event));
  expect(event.defaultPrevented).toBe(false);
});
it("buffers peer updates while preparing the snapshot and preserves their ordering", async () => {
  let finish!: (value: unknown) => void;
  mocks.load.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const t = await setup();
  let ready!: Promise<void>;
  await act(async () => {
    t.session.onPending();
    ready = Promise.resolve(t.session.onReady("write", () => true));
  });
  const payload = new TextEncoder().encode(
    JSON.stringify({
      type: WS_SUBTYPES.UPDATE,
      payload: { elements: [API.createElement({ id: "TEST-peer" })] },
    }),
  );
  const { encryptedBuffer, iv } = await encryptData(
    "AAAAAAAAAAAAAAAAAAAAAA",
    payload,
  );
  await act(async () => {
    t.socket.server("client-broadcast", encryptedBuffer, iv);
    await new Promise((resolve) => setTimeout(resolve, 20));
    finish([API.createElement({ id: "TEST-remote" })]);
    await ready;
    mocks.writable = true;
  });
  expect(window.h.elements.map((element) => element.id).sort()).toEqual([
    "TEST-peer",
    "TEST-remote",
  ]);
});
it("account identity changes invalidate a pending scene response", async () => {
  let finish!: (value: unknown) => void;
  mocks.load.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const t = await setup();
  let ready!: Promise<void>;
  await act(async () => {
    t.session.onPending();
    ready = Promise.resolve(t.session.onReady("write", () => true));
  });
  await act(async () => {
    appJotaiStore.set(cloudSessionAtom, {
      status: "signed-in",
      session: { user: { id: "TEST-other" } } as any,
    });
    finish([API.createElement({ id: "TEST-stale" })]);
    await expect(ready).rejects.toMatchObject({ name: "AbortError" });
  });
  expect(window.h.elements[0].id).toBe("TEST-original");
  expect((await t.result).name).toBe("AbortError");
});
it("reconnection merges remote data without discarding the existing scene", async () => {
  const t = await setup();
  await authorize(t);
  act(() =>
    API.setElements([
      API.createElement({ id: "TEST-local-unsaved" }),
      ...window.h.elements,
    ]),
  );
  mocks.load.mockResolvedValue([API.createElement({ id: "TEST-reconnected" })]);
  mocks.writable = false;
  await authorize(t);
  expect(window.h.elements.map((element) => element.id).sort()).toEqual([
    "TEST-local-unsaved",
    "TEST-reconnected",
    "TEST-remote",
  ]);
  expect(mocks.provider).toHaveBeenCalledTimes(2);
});
it("a canceled stop keeps the session active; accepted stop restores local editing", async () => {
  const t = await setup();
  await authorize(t);
  vi.spyOn(window, "confirm")
    .mockReturnValueOnce(false)
    .mockReturnValueOnce(true);
  act(() => t.collab.stopCollaboration());
  expect(t.collab.isCollaborating()).toBe(true);
  act(() => t.collab.stopCollaboration());
  expect(t.collab.isCollaborating()).toBe(false);
  expect(window.h.state.viewModeEnabled).toBe(false);
  expect(location.hash).toBe("");
  expect(getCurrentDrawing().drawingId).toBeNull();
  vi.restoreAllMocks();
});
it("write admission selects Supabase persistence and renewal downgrade blocks writes immediately", async () => {
  const t = await setup();
  await authorize(t);
  await act(async () =>
    t.collab.saveCollabRoomToFirebase(
      getSyncableElements(t.collab.getSceneElementsIncludingDeleted()),
    ),
  );
  expect(mocks.save).toHaveBeenCalledTimes(1);
  expect(mocks.legacySave).not.toHaveBeenCalled();
  await act(async () => {
    await t.session.onReady("read", () => true);
  });
  expect(t.collab.canWrite()).toBe(false);
  expect(window.h.state.viewModeEnabled).toBe(true);
  await act(async () =>
    t.collab.saveCollabRoomToFirebase(
      getSyncableElements(t.collab.getSceneElementsIncludingDeleted()),
    ),
  );
  expect(mocks.save).toHaveBeenCalledTimes(1);
});
it("invalidates the previous persistence operation generation on disconnect", async () => {
  const t = await setup();
  await authorize(t);
  const provider = mocks.provider.mock.calls[0][0];
  expect(provider.isCurrent()).toBe(true);
  act(() => t.session.onPending());
  expect(provider.isCurrent()).toBe(false);
  expect(t.collab.canWrite()).toBe(false);
  expect(window.h.state.viewModeEnabled).toBe(true);
});
it("rolls back scene and binary cache if the initial editor apply fails", async () => {
  const t = await setup();
  const file = {
    id: "TEST-original-file" as FileId,
    mimeType: "image/png" as const,
    dataURL: "data:image/png;base64,AQID" as DataURL,
    created: 1,
  };
  act(() => t.collab.excalidrawAPI.addFiles([file]));
  const update = t.collab.excalidrawAPI.updateScene;
  let first = true;
  const spy = vi
    .spyOn(t.collab.excalidrawAPI, "updateScene")
    .mockImplementation((data) => {
      if (first && data.elements?.[0]?.id === "TEST-remote") {
        first = false;
        throw new Error("TEST-apply-error");
      }
      update(data);
    });
  await act(async () => {
    await expect(t.session.onReady("read", () => true)).rejects.toThrow(
      "TEST-apply-error",
    );
    t.session.onError("협업 준비 실패");
  });
  expect(window.h.elements[0].id).toBe("TEST-original");
  expect(t.collab.excalidrawAPI.getFiles()[file.id].dataURL).toBe(file.dataURL);
  expect((await t.result).message).toBe("협업 준비 실패");
  spy.mockRestore();
});
it("keeps the original scene when the initial packet queue exceeds its bound", async () => {
  const t = await setup();
  await act(async () => {
    for (let i = 0; i < 65; i++) {
      t.socket.server(
        "client-broadcast",
        new ArrayBuffer(1),
        new Uint8Array(12),
      );
    }
  });
  expect(window.h.elements[0].id).toBe("TEST-original");
  expect((await t.result).message).toContain("처리하지 못했습니다");
});
