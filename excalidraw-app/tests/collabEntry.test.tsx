import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { API } from "@excalidraw/excalidraw/tests/helpers/api";
import { render } from "@excalidraw/excalidraw/tests/test-utils";

import ExcalidrawApp from "../App";
import { appJotaiStore } from "../app-jotai";
import { collabAPIAtom, isCollaboratingAtom } from "../collab/Collab";

const socket = vi.hoisted(() => vi.fn());
vi.mock("socket.io-client", () => ({ default: socket }));
const path =
  "/?collabStorage=supabase&invite=00000000-0000-4000-8000-000000000001#room=sc_aaaaaaaaaaaaaaaaaaaa,AAAAAAAAAAAAAAAAAAAAAA";
afterEach(() => {
  history.replaceState({}, "", "/");
});

it("keeps new-provider startup away from sockets and the legacy collaboration flag", async () => {
  history.replaceState({}, "", path);
  await render(<ExcalidrawApp />);
  await screen.findByText("협업 초대");
  expect(appJotaiStore.get(isCollaboratingAtom)).toBe(false);
  expect(socket).not.toHaveBeenCalled();
  await expect(
    appJotaiStore.get(collabAPIAtom)!.startCollaboration(null),
  ).rejects.toThrow("새 협업 방 연결");
});

it("preserves existing canvas on invitation navigation and close", async () => {
  history.replaceState({}, "", "/");
  await render(<ExcalidrawApp />);
  const shape = API.createElement({ id: "TEST-local-shape" });
  act(() => {
    API.setElements([shape]);
  });
  act(() => {
    history.pushState({}, "", path);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
  await screen.findByText("협업 초대");
  expect(window.h.elements.map((e) => e.id)).toContain(shape.id);
  fireEvent.click(screen.getByRole("button", { name: "닫기" }));
  await waitFor(() => expect(screen.queryByText("협업 초대")).toBeNull());
  expect(window.h.elements.map((e) => e.id)).toContain(shape.id);
  expect(socket).not.toHaveBeenCalled();
});
