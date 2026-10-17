import {
  createFileHandler,
  MAX_FILE_BYTES,
} from "../../../supabase/functions/collab-files/handler";

const origin = "http://127.0.0.1:3001";
const input = {
  roomId: "sc_aaaaaaaaaaaaaaaaaaaa",
  inviteId: "00000000-0000-4000-8000-000000000001",
  proof: "0".repeat(64),
  fileId: "TEST-file",
  action: "download",
};
const setup = () => {
  const backend = {
    consumeQuota: vi.fn().mockResolvedValue(true),
    reserve: vi.fn().mockResolvedValue(true),
    authorize: vi.fn().mockResolvedValue("write"),
    upload: vi.fn().mockResolvedValue(undefined),
    download: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
  };
  const handle = createFileHandler(backend, [origin]);
  const request = (body: unknown = input, requestOrigin = origin) =>
    new Request("https://gateway.test/collab-files", {
      method: "POST",
      headers: { origin: requestOrigin, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  return { backend, handle, request };
};
it("downloads bytes only after proof validation with no cache or public URL", async () => {
  const { backend, handle, request } = setup();
  const response = await handle(request());
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(
    new Uint8Array([1, 2, 3]),
  );
  expect(backend.authorize).toHaveBeenCalledWith(input);
  expect(backend.download).toHaveBeenCalledWith(
    `${input.roomId}/${input.fileId}`,
  );
});
it("allows read-only downloads, not uploads", async () => {
  const { backend, handle, request } = setup();
  backend.authorize.mockResolvedValue("read");
  expect((await handle(request())).status).toBe(200);
  expect(
    (await handle(request({ ...input, action: "upload", data: "AQID" })))
      .status,
  ).toBe(403);
  expect(backend.upload).not.toHaveBeenCalled();
});
it("preserves upload bytes and derives the path from validated room and ID", async () => {
  const { backend, handle, request } = setup();
  const response = await handle(
    request({ ...input, action: "upload", data: "AQID" }),
  );
  expect(await response.json()).toEqual({ ok: true });
  expect(backend.upload).toHaveBeenCalledWith(
    `${input.roomId}/${input.fileId}`,
    new Uint8Array([1, 2, 3]),
  );
});
it("rejects denied proofs before Storage", async () => {
  const { backend, handle, request } = setup();
  backend.authorize.mockResolvedValue(null);
  expect((await handle(request())).status).toBe(403);
  expect(backend.download).not.toHaveBeenCalled();
});
it.each([
  { ...input, fileId: "../other" },
  { ...input, roomId: "legacy-room" },
  { ...input, inviteId: "invalid" },
  { ...input, proof: "invalid" },
  { ...input, owner_id: "TEST-owner" },
  { ...input, path: "other-room/file" },
  { ...input, action: "delete" },
  { ...input, data: "AQID" },
  [],
  null,
])("rejects malformed/extra fields %#", async (body) => {
  const { backend, handle, request } = setup();
  expect((await handle(request(body))).status).toBe(400);
  expect(backend.authorize).not.toHaveBeenCalled();
});
it.each(["!", "AQ", ""])(
  "rejects invalid/noncanonical upload bytes %s",
  async (data) => {
    const { backend, handle, request } = setup();
    expect(
      (await handle(request({ ...input, action: "upload", data }))).status,
    ).toBe(400);
    expect(backend.upload).not.toHaveBeenCalled();
  },
);
it("rejects oversized streams without Content-Length", async () => {
  const { backend, handle } = setup();
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(6 * 1024 * 1024 + 1));
      controller.close();
    },
  });
  const response = await handle(
    new Request("https://gateway.test", {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body,
      duplex: "half",
    } as RequestInit & { duplex: string }),
  );
  expect(response.status).toBe(413);
  expect(backend.authorize).not.toHaveBeenCalled();
});
it("rejects oversized stored bytes", async () => {
  const { backend, handle, request } = setup();
  backend.download.mockResolvedValue(new Uint8Array(MAX_FILE_BYTES + 1));
  expect((await handle(request())).status).toBe(502);
});
it("blocks other origins and preflights only allowed origins", async () => {
  const { backend, handle, request } = setup();
  const denied = await handle(request(input, "https://evil.test"));
  expect(denied.status).toBe(403);
  expect(denied.headers.get("access-control-allow-origin")).toBeNull();
  const response = await handle(
    new Request("https://gateway.test", {
      method: "OPTIONS",
      headers: { origin },
    }),
  );
  expect(response.status).toBe(204);
  expect(response.headers.get("access-control-allow-origin")).toBe(origin);
  expect(backend.authorize).not.toHaveBeenCalled();
});
it("hides backend diagnostics", async () => {
  const { backend, handle, request } = setup();
  backend.download.mockRejectedValue(new Error("TEST sensitive diagnostics"));
  const response = await handle(request());
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("sensitive");
});
it("reports missing files", async () => {
  const { backend, handle, request } = setup();
  backend.download.mockResolvedValue(null);
  expect((await handle(request())).status).toBe(404);
});
