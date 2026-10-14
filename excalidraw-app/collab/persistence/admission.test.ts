import { webcrypto } from "node:crypto";

import { consumeInviteReturn } from "./entryRoute";

const mocks = vi.hoisted(() => ({
  account: vi.fn(),
  guest: vi.fn(),
  oauth: vi.fn(),
  create: vi.fn(),
}));
vi.mock("../../cloud/supabaseClient", () => ({
  supabase: { rpc: mocks.account, auth: { signInWithOAuth: mocks.oauth } },
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.create }));
const invite = {
  provider: "supabase" as const,
  roomId: "sc_aaaaaaaaaaaaaaaaaaaa",
  roomKey: "AAAAAAAAAAAAAAAAAAAAAA",
  inviteId: "00000000-0000-4000-8000-000000000001",
};
const path = `/?collabStorage=supabase&invite=${invite.inviteId}#room=${invite.roomId},${invite.roomKey}`;
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubGlobal("crypto", webcrypto);
  vi.stubEnv("VITE_SUPABASE_URL", "https://cloud.test");
  vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "TEST-public-key");
  mocks.account.mockResolvedValue({ data: "write", error: null });
  mocks.guest.mockResolvedValue({ data: "read", error: null });
  mocks.create.mockReturnValue({ rpc: mocks.guest });
  mocks.oauth.mockResolvedValue({ error: null });
  history.replaceState({}, "", "/");
  sessionStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  sessionStorage.clear();
});

it("uses a separate nonpersistent guest client and never calls the account RPC", async () => {
  const { checkCollabInvitation } = await import("./admission");
  await expect(checkCollabInvitation(invite, "guest")).resolves.toBe("read");
  await checkCollabInvitation(invite, "guest");
  expect(mocks.account).not.toHaveBeenCalled();
  expect(mocks.create).toHaveBeenCalledTimes(1);
  expect(mocks.create.mock.calls[0][2].auth).toEqual({
    storageKey: "personal-cloud-collab-guest",
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  });
});
it("validates signed-in participation with proof without transmitting the key", async () => {
  const { checkCollabInvitation } = await import("./admission");
  await expect(checkCollabInvitation(invite, "account")).resolves.toBe("write");
  expect(mocks.account).toHaveBeenCalledWith("collab_check_invite", {
    p_room_id: invite.roomId,
    p_invite_id: invite.inviteId,
    p_proof: expect.stringMatching(/^[a-f0-9]{64}$/),
  });
});
it.each([
  { data: null, error: { code: "42501", message: "TEST sensitive" } },
  { data: "owner", error: null },
  { data: null, error: { code: "PGRST202", message: "TEST sensitive" } },
])("sanitizes access and response failures %#", async (result) => {
  mocks.account.mockResolvedValue(result);
  const { checkCollabInvitation } = await import("./admission");
  await expect(checkCollabInvitation(invite, "account")).rejects.not.toThrow(
    "TEST sensitive",
  );
});
it("keeps a local one-time return but passes only origin to OAuth", async () => {
  const { signInForCollabInvite } = await import("./admission");
  await signInForCollabInvite(new URL(path, location.origin).href);
  expect(mocks.oauth).toHaveBeenCalledWith({
    provider: "google",
    options: { redirectTo: location.origin },
  });
  expect(consumeInviteReturn()).toBe(path);
});
it("clears the return and sanitizes OAuth errors", async () => {
  mocks.oauth.mockResolvedValue({ error: new Error("TEST sensitive") });
  const { signInForCollabInvite } = await import("./admission");
  await expect(
    signInForCollabInvite(new URL(path, location.origin).href),
  ).rejects.toThrow("로그인을 시작하지 못했습니다.");
  expect(consumeInviteReturn()).toBeNull();
});
