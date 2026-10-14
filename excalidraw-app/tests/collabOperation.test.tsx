import { act } from "@testing-library/react";
import { toBrandedType } from "@excalidraw/common";
import { API } from "@excalidraw/excalidraw/tests/helpers/api";
import { render } from "@excalidraw/excalidraw/tests/test-utils";

import type { RemoteExcalidrawElement } from "@excalidraw/excalidraw/data/reconcile";

import ExcalidrawApp from "../App";
import { appJotaiStore } from "../app-jotai";
import { isCollaboratingAtom } from "../collab/Collab";
import { getSyncableElements } from "../data";

import type { Socket } from "socket.io-client";

const save = vi.hoisted(() => vi.fn());
vi.mock("../data/firebase", () => ({
  saveToFirebase: save,
  loadFromFirebase: vi.fn().mockResolvedValue(null),
  isSavedToFirebase: () => true,
  saveFilesToFirebase: vi
    .fn()
    .mockResolvedValue({ savedFiles: [], erroredFiles: [] }),
  loadFilesFromFirebase: vi
    .fn()
    .mockResolvedValue({ loadedFiles: [], erroredFiles: new Map() }),
}));
beforeEach(() => {
  history.replaceState({}, "", "/");
  save.mockResolvedValue(null);
});
afterEach(() => {
  vi.restoreAllMocks();
  save.mockReset();
  act(() => appJotaiStore.set(isCollaboratingAtom, false));
});
const setup = async () => {
  await render(<ExcalidrawApp />);
  const collab = window.collab;
  collab.portal.roomId = "aaaaaaaaaaaaaaaaaaaa";
  collab.portal.roomKey = "TEST-key";
  collab.portal.socket = { close: vi.fn(), off: vi.fn() } as unknown as Socket;
  act(() => {
    appJotaiStore.set(isCollaboratingAtom, true);
    API.setElements([API.createElement({ id: "TEST-current" })]);
  });
  return collab;
};

it("does not merge an old save response into a different current room", async () => {
  const collab = await setup();
  let resolve!: (value: RemoteExcalidrawElement[]) => void;
  save.mockReturnValueOnce(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const operation = collab.saveCollabRoomToFirebase(
    getSyncableElements(collab.getSceneElementsIncludingDeleted()),
  );
  collab.portal.roomId = "bbbbbbbbbbbbbbbbbbbb";
  await act(async () => {
    resolve(
      toBrandedType<RemoteExcalidrawElement[]>([
        API.createElement({ id: "TEST-old-response" }),
      ]),
    );
    await operation;
  });
  expect(window.h.elements.map((element) => element.id)).toEqual([
    "TEST-current",
  ]);
});

it("does not show stale save errors after a room switch", async () => {
  const collab = await setup();
  let reject!: (error: Error) => void;
  save.mockReturnValueOnce(
    new Promise((_done, failed) => {
      reject = failed;
    }),
  );
  const operation = collab.saveCollabRoomToFirebase(
    getSyncableElements(collab.getSceneElementsIncludingDeleted()),
  );
  collab.portal.roomId = "bbbbbbbbbbbbbbbbbbbb";
  await act(async () => {
    reject(new Error("TEST old backend error"));
    await operation;
  });
  expect(collab.state.errorMessage).toBeNull();
});

it("does not invalidate an active session when stopping is canceled", async () => {
  const collab = await setup();
  const current = collab.captureRoomOperation();
  vi.spyOn(window, "confirm").mockReturnValue(false);
  await act(async () => {
    collab.stopCollaboration(true);
    await Promise.resolve();
  });
  expect(current()).toBe(true);
  expect(collab.portal.socket).not.toBeNull();
});
