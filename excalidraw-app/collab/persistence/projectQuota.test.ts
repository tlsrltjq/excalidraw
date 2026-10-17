import { createProjectQuota } from "../../../supabase/functions/_shared/projectQuota";
import { createFileHandler } from "../../../supabase/functions/collab-files/handler";
import { createTicketHandler } from "../../../supabase/functions/collab-ticket/handler";

const origin = "https://app.test";
const input = {
  roomId: "sc_aaaaaaaaaaaaaaaaaaaa",
  inviteId: "00000000-0000-4000-8000-000000000001",
  proof: "0".repeat(64),
  fileId: "TEST-file",
  action: "upload",
  data: "AQID",
};
const request = (body: unknown = input) =>
  new Request("https://edge.test", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const backend = () => ({
  consumeQuota: vi.fn().mockResolvedValue(true),
  reserve: vi.fn().mockResolvedValue(true),
  authorize: vi.fn().mockResolvedValue("write"),
  upload: vi.fn().mockResolvedValue(undefined),
  download: vi.fn().mockResolvedValue(new Uint8Array([1])),
  sign: vi.fn().mockResolvedValue("TEST-ticket"),
});

it.each(["files", "tickets"])(
  "stops %s body and backend work when shared quota denies",
  async (kind) => {
    const b = backend();
    b.consumeQuota.mockResolvedValue(false);
    const handle =
      kind === "files"
        ? createFileHandler(b, [origin])
        : createTicketHandler(b, [origin]);
    const req = request();
    const result = await handle(req);
    expect(result.status).toBe(429);
    expect(result.headers.get("retry-after")).toBe("60");
    expect(result.headers.get("access-control-allow-origin")).toBe(origin);
    expect(req.bodyUsed).toBe(false);
    expect(b.authorize).not.toHaveBeenCalled();
    expect(b.upload).not.toHaveBeenCalled();
    expect(b.sign).not.toHaveBeenCalled();
  },
);

it("fails closed and sanitizes quota transport errors", async () => {
  const b = backend();
  b.consumeQuota.mockRejectedValue(new Error("TEST private backend data"));
  const result = await createFileHandler(b, [origin])(request());
  expect(result.status).toBe(503);
  expect(await result.text()).not.toContain("private");
  expect(b.authorize).not.toHaveBeenCalled();
});

it("denies file upload without a slot and never refunds after ambiguous upload failure", async () => {
  const b = backend();
  const handle = createFileHandler(b, [origin]);
  b.reserve.mockResolvedValueOnce(false);
  expect((await handle(request())).status).toBe(507);
  expect(b.upload).not.toHaveBeenCalled();
  b.upload.mockRejectedValueOnce(new Error("TEST response lost"));
  expect((await handle(request())).status).toBe(503);
  expect((await handle(request())).status).toBe(200);
  expect(b.reserve).toHaveBeenCalledTimes(3);
  expect(b.reserve.mock.calls[0][0]).toMatchObject({
    fileId: input.fileId,
    roomId: input.roomId,
  });
});

it("reserves only valid write uploads, not read downloads or malformed bytes", async () => {
  const b = backend();
  const handle = createFileHandler(b, [origin]);
  expect((await handle(request({ ...input, data: "bad base64" }))).status).toBe(
    400,
  );
  b.authorize.mockResolvedValue("read");
  expect((await handle(request())).status).toBe(403);
  const { data, ...download } = input;
  expect(
    (await handle(request({ ...download, action: "download" }))).status,
  ).toBe(200);
  expect(b.reserve).not.toHaveBeenCalled();
});

it("uses shared service-only RPCs with fixed argument allowlist", async () => {
  const transport = vi
    .fn<typeof fetch>()
    .mockImplementation(async () => new Response("true"));
  const quota = createProjectQuota(
    "https://db.test",
    "TEST-server-key",
    transport,
  );
  expect(await quota.consume("files")).toBe(true);
  expect(await quota.reserve(input)).toBe(true);
  const [url, options] = transport.mock.calls[1];
  expect(url).toBe("https://db.test/rest/v1/rpc/collab_reserve_file");
  expect(JSON.parse(options!.body as string)).toEqual({
    p_room_id: input.roomId,
    p_invite_id: input.inviteId,
    p_proof: input.proof,
    p_file_id: input.fileId,
  });
  expect(options!.redirect).toBe("error");
  expect(options!.headers).toMatchObject({
    authorization: "Bearer TEST-server-key",
  });
});

it.each(["null", "{}", "1", '"true"'])(
  "rejects unexpected quota response %s",
  async (value) => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(value));
    await expect(
      createProjectQuota("https://db.test", "TEST-key", transport).consume(
        "tickets",
      ),
    ).rejects.toThrow("Invalid quota response");
  },
);

it("rejects non-success RPC response without exposing body", async () => {
  const transport = vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response("TEST private", { status: 403 }));
  await expect(
    createProjectQuota("https://db.test", "TEST-key", transport).consume(
      "files",
    ),
  ).rejects.toThrow("Project quota unavailable");
});
