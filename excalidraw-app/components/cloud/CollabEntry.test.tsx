import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { StrictMode } from "react";

import { CollabEntry } from "./CollabEntry";

const mocks = vi.hoisted(() => ({
  check: vi.fn(),
  login: vi.fn(),
  session: {
    status: "signed-out",
    session: null as null | { user: { id: string } },
  },
}));
vi.mock("../../cloud/session", () => ({
  useCloudSession: () => mocks.session,
}));
vi.mock("../../cloud/supabaseClient", () => ({ isCloudConfigured: true }));
vi.mock("../../collab/persistence/admission", () => ({
  checkCollabInvitation: mocks.check,
  signInForCollabInvite: mocks.login,
}));
vi.mock("@excalidraw/excalidraw/components/Dialog", () => ({
  Dialog: ({
    children,
    title,
  }: {
    children: React.ReactNode;
    title: string;
  }) => (
    <div role="dialog" aria-label={title}>
      {children}
    </div>
  ),
}));
const path =
  "/?collabStorage=supabase&invite=00000000-0000-4000-8000-000000000001#room=sc_aaaaaaaaaaaaaaaaaaaa,AAAAAAAAAAAAAAAAAAAAAA";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.status = "signed-out";
  mocks.session.session = null;
  mocks.check.mockResolvedValue("write");
  mocks.login.mockResolvedValue(undefined);
  history.replaceState({}, "", path);
  sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  history.replaceState({}, "", "/");
  sessionStorage.clear();
});

it("shows both choices and makes no request until a choice in Strict Mode", () => {
  render(
    <StrictMode>
      <CollabEntry />
    </StrictMode>,
  );
  expect(
    screen.getByRole("button", { name: "Google로 로그인" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "게스트로 참여" }),
  ).toBeInTheDocument();
  expect(mocks.check).not.toHaveBeenCalled();
});
it("checks guests once, but never claims that verification connected the room", async () => {
  render(<CollabEntry />);
  const button = screen.getByRole("button", { name: "게스트로 참여" });
  fireEvent.click(button);
  fireEvent.click(button);
  await screen.findByText("편집 초대 확인 완료");
  expect(mocks.check).toHaveBeenCalledTimes(1);
  expect(mocks.check.mock.calls[0][1]).toBe("guest");
  expect(
    screen.getByText("공동편집 연결을 아직 사용할 수 없습니다."),
  ).toBeInTheDocument();
});
it("uses login only when there is no account session", async () => {
  render(<CollabEntry />);
  fireEvent.click(screen.getByRole("button", { name: "Google로 로그인" }));
  await waitFor(() => expect(mocks.login).toHaveBeenCalledTimes(1));
  expect(mocks.check).not.toHaveBeenCalled();
});
it("checks an existing account without another OAuth redirect", async () => {
  mocks.session.status = "signed-in";
  mocks.session.session = { user: { id: "TEST-account" } };
  mocks.check.mockResolvedValue("read");
  render(<CollabEntry />);
  fireEvent.click(screen.getByRole("button", { name: "로그인 계정으로 참여" }));
  await screen.findByText("읽기 전용 초대 확인 완료");
  expect(mocks.check.mock.calls[0][1]).toBe("account");
  expect(mocks.login).not.toHaveBeenCalled();
});
it("allows retry after a failed check", async () => {
  mocks.check.mockRejectedValueOnce(new Error("TEST denied"));
  render(<CollabEntry />);
  fireEvent.click(screen.getByRole("button", { name: "게스트로 참여" }));
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "게스트로 참여" }));
  await screen.findByText("편집 초대 확인 완료");
});
it("ignores a late result after closing", async () => {
  let resolve!: (scope: string) => void;
  mocks.check.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  render(<CollabEntry />);
  fireEvent.click(screen.getByRole("button", { name: "게스트로 참여" }));
  fireEvent.click(screen.getByRole("button", { name: "닫기" }));
  await act(async () => resolve("write"));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(location.hash).toBe("");
});
it("invalidates a pending response on account change", async () => {
  mocks.session.status = "signed-in";
  mocks.session.session = { user: { id: "TEST-a" } };
  let resolve!: (scope: string) => void;
  mocks.check.mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const view = render(<CollabEntry />);
  fireEvent.click(screen.getByRole("button", { name: "로그인 계정으로 참여" }));
  mocks.session.session = { user: { id: "TEST-b" } };
  view.rerender(<CollabEntry />);
  await act(async () => resolve("write"));
  expect(screen.queryByText("편집 초대 확인 완료")).toBeNull();
});
it("blocks malformed provider links without participation buttons", () => {
  history.replaceState(
    {},
    "",
    "/?collabStorage=unknown#room=aaaaaaaaaaaaaaaaaaaa,AAAAAAAAAAAAAAAAAAAAAA",
  );
  render(<CollabEntry />);
  expect(screen.getByRole("alert")).toHaveTextContent("올바르지 않은 초대");
  expect(screen.queryByRole("button", { name: "게스트로 참여" })).toBeNull();
});
it("does not replace an unrelated scene link with a stored login return", () => {
  sessionStorage.setItem(
    "personal-cloud:invite-return:v1",
    JSON.stringify({ path, expiresAt: Date.now() + 60000 }),
  );
  history.replaceState({}, "", "/#json=TEST,key");
  mocks.session.status = "signed-in";
  render(<CollabEntry />);
  expect(location.hash).toBe("#json=TEST,key");
  expect(screen.queryByRole("dialog")).toBeNull();
});
it("restores a valid one-time OAuth return after session restoration", async () => {
  sessionStorage.setItem(
    "personal-cloud:invite-return:v1",
    JSON.stringify({ path, expiresAt: Date.now() + 60000 }),
  );
  history.replaceState({}, "", "/");
  mocks.session.status = "signed-in";
  render(
    <StrictMode>
      <CollabEntry />
    </StrictMode>,
  );
  await screen.findByRole("dialog");
  expect(location.hash).toContain("#room=sc_");
  expect(sessionStorage.getItem("personal-cloud:invite-return:v1")).toBeNull();
  expect(mocks.check).not.toHaveBeenCalled();
});
