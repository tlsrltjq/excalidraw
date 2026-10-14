import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

import { appJotaiStore, Provider } from "../../app-jotai";
import { cloudSessionAtom } from "../../cloud/session";

import { RoomManagement, roomManagementOpenAtom } from "./RoomManagement";

const mocks = vi.hoisted(() => ({
  rooms: vi.fn(),
  invites: vi.fn(),
  create: vi.fn(),
  issue: vi.fn(),
  revoke: vi.fn(),
  recover: vi.fn(),
}));
vi.mock("../../cloud/supabaseClient", () => ({
  supabase: {},
  isCloudConfigured: true,
}));
vi.mock("../../cloud/session", async () => {
  const { atom, useAtomValue } = await import("../../app-jotai");
  const state = atom({
    status: "signed-in",
    session: { user: { id: "owner" } },
  });
  return {
    cloudSessionAtom: state,
    useCloudSession: () => useAtomValue(state),
  };
});
vi.mock("../../collab/persistence/roomManagement", async (original) => {
  const actual = await original<
    typeof import("../../collab/persistence/roomManagement")
  >();
  return {
    ...actual,
    listOwnedRooms: mocks.rooms,
    listRoomInvites: mocks.invites,
    createOwnedRoom: mocks.create,
    issueRoomInvite: mocks.issue,
    revokeRoomInvite: mocks.revoke,
    recoverRoomKey: mocks.recover,
  };
});
vi.mock("@excalidraw/excalidraw/components/Dialog", () => ({
  Dialog: ({
    children,
    onCloseRequest,
  }: {
    children: React.ReactNode;
    onCloseRequest: () => void;
  }) => (
    <div role="dialog">
      <button onClick={onCloseRequest}>닫기</button>
      {children}
    </div>
  ),
}));

const roomId = "sc_01234567890123456789";
const invitation = {
  id: "11111111-1111-4111-8111-111111111111",
  scope: "read",
  expires_at: "2099-01-01T00:00:00Z",
  revoked_at: null,
};
const show = () =>
  render(
    <Provider store={appJotaiStore}>
      <RoomManagement />
    </Provider>,
  );
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("VITE_COLLAB_SUPABASE_ENABLED", "true");
  appJotaiStore.set(roomManagementOpenAtom, true);
  appJotaiStore.set(cloudSessionAtom, {
    status: "signed-in",
    session: { user: { id: "owner" } },
  } as never);
  mocks.rooms.mockResolvedValue([
    { id: roomId, disabled: false, created_at: "2026-10-14" },
  ]);
  mocks.invites.mockResolvedValue([invitation]);
  mocks.create.mockResolvedValue(undefined);
  mocks.issue.mockResolvedValue("https://example.test/invitation");
  mocks.recover.mockResolvedValue("AAAAAAAAAAAAAAAAAAAAAA");
  mocks.revoke.mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

it("hides when disabled and does not fetch", () => {
  vi.stubEnv("VITE_COLLAB_SUPABASE_ENABLED", "false");
  show();
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(mocks.rooms).not.toHaveBeenCalled();
});

it("requires login", () => {
  appJotaiStore.set(cloudSessionAtom, { status: "signed-out", session: null });
  show();
  expect(screen.getByText("로그인이 필요합니다.")).toBeInTheDocument();
  expect(mocks.rooms).not.toHaveBeenCalled();
});

it("creates an empty room with first write invitation without navigation", async () => {
  show();
  await screen.findByRole("option", { name: roomId });
  const before = window.location.href;
  fireEvent.click(screen.getByRole("button", { name: "새 빈 방" }));
  await waitFor(() => expect(mocks.issue).toHaveBeenCalledTimes(1));
  expect(mocks.issue.mock.calls[0][1].scope).toBe("write");
  expect(mocks.create).toHaveBeenCalledTimes(1);
  expect(window.location.href).toBe(before);
  await screen.findByDisplayValue("https://example.test/invitation");
});

it("retries the same credentials after partial failure", async () => {
  mocks.issue.mockRejectedValueOnce(new Error("private raw failure"));
  show();
  await screen.findByRole("option", { name: roomId });
  fireEvent.click(screen.getByRole("button", { name: "새 빈 방" }));
  await screen.findByRole("alert");
  const draft = mocks.issue.mock.calls[0][1];
  expect(screen.queryByText("private raw failure")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "발급 재시도" }));
  await waitFor(() => expect(mocks.issue).toHaveBeenCalledTimes(2));
  expect(mocks.issue.mock.calls[1][1]).toBe(draft);
});

it("recovers key before issuing a read invite with selected expiry", async () => {
  show();
  await screen.findByRole("option", { name: roomId });
  fireEvent.change(screen.getByLabelText("방"), { target: { value: roomId } });
  await screen.findByLabelText("기존 초대 링크");
  expect(screen.getByRole("button", { name: "초대 발급" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("기존 초대 링크"), {
    target: { value: "old link" },
  });
  fireEvent.click(screen.getByRole("button", { name: "확인" }));
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "초대 발급" }),
    ).not.toBeDisabled(),
  );
  fireEvent.change(screen.getByLabelText("권한"), {
    target: { value: "read" },
  });
  fireEvent.change(screen.getByLabelText("만료"), { target: { value: "168" } });
  fireEvent.click(screen.getByRole("button", { name: "초대 발급" }));
  await waitFor(() => expect(mocks.issue).toHaveBeenCalled());
  const draft = mocks.issue.mock.calls[0][1];
  expect(draft.scope).toBe("read");
  expect(Date.parse(draft.expiresAt) - Date.now()).toBeGreaterThan(
    167 * 3600000,
  );
});

it("confirms revocation and allows it without having a key", async () => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
  show();
  await screen.findByRole("option", { name: roomId });
  fireEvent.change(screen.getByLabelText("방"), { target: { value: roomId } });
  fireEvent.click(await screen.findByRole("button", { name: "폐기" }));
  await waitFor(() =>
    expect(mocks.revoke).toHaveBeenCalledWith({}, roomId, invitation.id),
  );
});

it("does not revoke after cancelling confirmation", async () => {
  vi.spyOn(window, "confirm").mockReturnValue(false);
  show();
  await screen.findByRole("option", { name: roomId });
  fireEvent.change(screen.getByLabelText("방"), { target: { value: roomId } });
  fireEvent.click(await screen.findByRole("button", { name: "폐기" }));
  expect(mocks.revoke).not.toHaveBeenCalled();
});

it("prevents duplicate creation clicks", async () => {
  mocks.create.mockImplementation(() => new Promise(() => {}));
  show();
  await screen.findByRole("option", { name: roomId });
  const button = screen.getByRole("button", { name: "새 빈 방" });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(mocks.create).toHaveBeenCalledTimes(1);
  expect(button).toBeDisabled();
});

it("disables copy and revoke for expired and revoked invites", async () => {
  mocks.invites.mockResolvedValue([
    { ...invitation, expires_at: "2000-01-01T00:00:00Z" },
    {
      ...invitation,
      id: "22222222-2222-4222-8222-222222222222",
      revoked_at: "2026-10-14",
    },
  ]);
  show();
  await screen.findByRole("option", { name: roomId });
  fireEvent.change(screen.getByLabelText("방"), { target: { value: roomId } });
  await screen.findByText(/폐기됨/);
  screen
    .getAllByRole("button", { name: "폐기" })
    .forEach((button) => expect(button).toBeDisabled());
  screen
    .getAllByRole("button", { name: "초대 링크 복사" })
    .forEach((button) => expect(button).toBeDisabled());
});

it.each(["close", "account"])(
  "invalidates pending requests on %s",
  async (change) => {
    let resolve!: (value: string) => void;
    mocks.issue.mockImplementation(
      () =>
        new Promise<string>((done) => {
          resolve = done;
        }),
    );
    show();
    await screen.findByRole("option", { name: roomId });
    fireEvent.click(screen.getByRole("button", { name: "새 빈 방" }));
    await waitFor(() => expect(mocks.issue).toHaveBeenCalled());
    const current = mocks.issue.mock.calls[0][2];
    if (change === "close") {
      fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    } else {
      act(() =>
        appJotaiStore.set(cloudSessionAtom, {
          status: "signed-out",
          session: null,
        }),
      );
    }
    expect(current()).toBe(false);
    await act(async () => resolve("secret link"));
    expect(screen.queryByDisplayValue("secret link")).toBeNull();
  },
);
