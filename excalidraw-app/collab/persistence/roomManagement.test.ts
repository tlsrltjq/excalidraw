import { webcrypto } from "node:crypto";

import { deriveInviteProof, hashInviteProof } from "./invites";

import {
  createOwnedRoom,
  invitationLink,
  issueRoomInvite,
  listOwnedRooms,
  listRoomInvites,
  newInviteDraft,
  newRoomCredentials,
  recoverRoomKey,
  revokeRoomInvite,
} from "./roomManagement";

import type { SupabaseClient } from "@supabase/supabase-js";

const room = {
  roomId: "sc_01234567890123456789",
  roomKey: "AAAAAAAAAAAAAAAAAAAAAA",
};
const current = () => true;
const clientMock = () => {
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    maybeSingle: vi.fn(),
  };
  const rpc = vi.fn().mockResolvedValue({ error: null });
  const from = vi.fn(() => query);
  return {
    client: { rpc, from } as unknown as SupabaseClient,
    query,
    rpc,
    from,
  };
};

beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
});
afterEach(() => vi.unstubAllGlobals());

it("generates unique canonical room credentials and clean links", () => {
  const a = newRoomCredentials();
  const b = newRoomCredentials();
  expect(a.roomId).toMatch(/^sc_[a-f0-9]{20}$/);
  expect(a.roomId).not.toBe(b.roomId);
  expect(a.roomKey).toHaveLength(22);
  const draft = newInviteDraft(a, "write", 24);
  expect(invitationLink(draft.invite)).toContain(
    `?collabStorage=supabase&invite=${draft.invite.inviteId}#room=${a.roomId},${a.roomKey}`,
  );
  expect(() => newInviteDraft(a, "read", 720)).toThrow();
});

it.each(["read", "write"] as const)(
  "issues %s using only a hash",
  async (scope) => {
    const { client, rpc } = clientMock();
    const draft = newInviteDraft(room, scope, 1);
    await issueRoomInvite(client, draft, current);
    const args = rpc.mock.calls[0][1];
    expect(args.p_scope).toBe(scope);
    expect(args.p_proof_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(args)).not.toContain(room.roomKey);
    expect(args).not.toHaveProperty("owner_id");
  },
);

it("lists metadata without proofs or scene", async () => {
  const { client, query } = clientMock();
  await listOwnedRooms(client);
  await listRoomInvites(client, room.roomId);
  expect(query.select.mock.calls).toEqual([
    ["id,disabled,created_at"],
    ["id,scope,expires_at,revoked_at"],
  ]);
});

it("resolves a committed create response loss through owner RLS", async () => {
  const { client, rpc, query } = clientMock();
  rpc.mockResolvedValue({ error: {} });
  query.maybeSingle.mockResolvedValue({
    data: { id: room.roomId, disabled: false },
  });
  await createOwnedRoom(client, room.roomId, current);
  expect(query.eq).toHaveBeenCalledWith("id", room.roomId);
});

it("does not adopt another owner's missing or disabled room", async () => {
  const { client, rpc, query } = clientMock();
  rpc.mockResolvedValue({ error: {} });
  query.maybeSingle.mockResolvedValue({ data: null });
  await expect(createOwnedRoom(client, room.roomId, current)).rejects.toThrow();
  query.maybeSingle.mockResolvedValue({
    data: { id: room.roomId, disabled: true },
  });
  await expect(createOwnedRoom(client, room.roomId, current)).rejects.toThrow();
});

it("checks proof after an ambiguous invite retry", async () => {
  const { client, rpc, query } = clientMock();
  const draft = newInviteDraft(room, "read", 24);
  rpc
    .mockResolvedValueOnce({ error: {} })
    .mockResolvedValueOnce({ data: "read", error: null });
  query.maybeSingle.mockResolvedValue({
    data: {
      id: draft.invite.inviteId,
      scope: "read",
      expires_at: draft.expiresAt,
      revoked_at: null,
    },
  });
  await expect(issueRoomInvite(client, draft, current)).resolves.toContain(
    draft.invite.inviteId,
  );
  expect(rpc.mock.calls[1][0]).toBe("collab_check_invite");
});

it("denies revoked invite retry", async () => {
  const { client, rpc, query } = clientMock();
  const draft = newInviteDraft(room, "read", 24);
  rpc.mockResolvedValue({ error: {} });
  query.maybeSingle.mockResolvedValue({
    data: {
      id: draft.invite.inviteId,
      scope: "read",
      expires_at: draft.expiresAt,
      revoked_at: new Date().toISOString(),
    },
  });
  await expect(issueRoomInvite(client, draft, current)).rejects.toThrow();
});

it("checks owner-only proof hash before recovering even an expired link key", async () => {
  const { client, query } = clientMock();
  const draft = newInviteDraft(room, "write", 1);
  query.maybeSingle.mockResolvedValue({
    data: {
      proof_hash: await hashInviteProof(await deriveInviteProof(draft.invite)),
    },
  });
  await expect(
    recoverRoomKey(client, invitationLink(draft.invite), room.roomId, current),
  ).resolves.toBe(room.roomKey);
  query.maybeSingle.mockResolvedValue({ data: null, error: {} });
  await expect(
    recoverRoomKey(client, invitationLink(draft.invite), room.roomId, current),
  ).rejects.toThrow();
});

it("rejects a different room without requesting recovery", async () => {
  const { client, rpc } = clientMock();
  const draft = newInviteDraft(room, "write", 1);
  await expect(
    recoverRoomKey(
      client,
      invitationLink(draft.invite),
      "sc_11111111111111111111",
      current,
    ),
  ).rejects.toThrow();
  expect(rpc).not.toHaveBeenCalled();
});

it("stops stale creation before and after requests", async () => {
  const { client, rpc, query } = clientMock();
  await expect(
    createOwnedRoom(client, room.roomId, () => false),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(rpc).not.toHaveBeenCalled();
  let active = true;
  rpc.mockImplementation(async () => {
    active = false;
    return { error: {} };
  });
  await expect(
    createOwnedRoom(client, room.roomId, () => active),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(query.select).not.toHaveBeenCalled();
});

it("revokes only the specified invite and sanitizes failures", async () => {
  const { client, rpc } = clientMock();
  const id = crypto.randomUUID();
  await revokeRoomInvite(client, room.roomId, id);
  expect(rpc).toHaveBeenCalledWith("collab_revoke_invite", {
    p_room_id: room.roomId,
    p_invite_id: id,
  });
  rpc.mockResolvedValue({ error: { message: "secret backend detail" } });
  await expect(revokeRoomInvite(client, room.roomId, id)).rejects.toThrow(
    "초대를 폐기하지 못했습니다.",
  );
});
