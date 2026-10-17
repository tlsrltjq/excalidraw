import { webcrypto } from "node:crypto";

import { deflate } from "pako";

import {
  compressData,
  decompressData,
} from "@excalidraw/excalidraw/data/encode";
import {
  encryptData,
  generateEncryptionKey,
} from "@excalidraw/excalidraw/data/encryption";

import { createRequestBudget } from "../../../supabase/functions/_shared/requestBudget";
import { createFileHandler } from "../../../supabase/functions/collab-files/handler";
import { createTicketHandler } from "../../../supabase/functions/collab-ticket/handler";

beforeEach(() => vi.stubGlobal("crypto", webcrypto));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("limits successful and failed attempts and recovers after the minute", () => {
  let time = 0;
  const budget = createRequestBudget(2, 1, () => time);
  const a = budget.acquire();
  expect("release" in a).toBe(true);
  expect(budget.acquire()).toEqual({ retryAfter: 1 });
  if ("release" in a) {
    a.release();
    a.release();
  }
  const b = budget.acquire();
  if ("release" in b) {
    b.release();
  }
  expect(budget.acquire()).toEqual({ retryAfter: 60 });
  time = 59000;
  expect(budget.acquire()).toEqual({ retryAfter: 1 });
  time = 60000;
  expect("release" in budget.acquire()).toBe(true);
});

const origin = "https://app.test";
const input = {
  roomId: "sc_aaaaaaaaaaaaaaaaaaaa",
  inviteId: "00000000-0000-4000-8000-000000000001",
  proof: "0".repeat(64),
};
const request = (body: unknown) =>
  new Request("https://gateway.test", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });

it("rejects file concurrency before authorization and releases on failure", async () => {
  const resolvers: ((value: null) => void)[] = [];
  const backend = {
    consumeQuota: vi.fn().mockResolvedValue(true),
    reserve: vi.fn().mockResolvedValue(true),
    authorize: vi.fn(
      () => new Promise<null>((resolve) => resolvers.push(resolve)),
    ),
    upload: vi.fn(),
    download: vi.fn(),
  };
  const handle = createFileHandler(backend, [origin]);
  const body = { ...input, fileId: "TEST", action: "download" };
  const calls = Array.from({ length: 3 }, () => handle(request(body)));
  await vi.waitFor(() => expect(backend.authorize).toHaveBeenCalledTimes(3));
  const rejected = await handle(request(body));
  expect(rejected.status).toBe(429);
  expect(rejected.headers.get("retry-after")).toBe("1");
  expect(rejected.headers.get("access-control-allow-origin")).toBe(origin);
  resolvers.forEach((resolve) => resolve(null));
  expect((await Promise.all(calls)).map((r) => r.status)).toEqual([
    403, 403, 403,
  ]);
  backend.authorize.mockResolvedValue(null);
  expect((await handle(request(body))).status).toBe(403);
  expect(backend.download).not.toHaveBeenCalled();
});

it.each(["file", "ticket"])(
  "counts malformed %s attempts without calling backend",
  async (kind) => {
    const backend = {
      consumeQuota: vi.fn().mockResolvedValue(true),
      reserve: vi.fn().mockResolvedValue(true),
      authorize: vi.fn(),
      upload: vi.fn(),
      download: vi.fn(),
      sign: vi.fn(),
    };
    const handle =
      kind === "file"
        ? createFileHandler(backend, [origin])
        : createTicketHandler(backend, [origin]);
    const count = kind === "file" ? 120 : 240;
    for (let i = 0; i < count; i++) {
      expect((await handle(request({}))).status).toBe(400);
    }
    const response = await handle(request({}));
    expect(response.status).toBe(429);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(backend.authorize).not.toHaveBeenCalled();
  },
);

it("does not count CORS preflight against ticket renewal budget", async () => {
  const backend = {
    consumeQuota: vi.fn().mockResolvedValue(true),
    authorize: vi.fn().mockResolvedValue("write"),
    sign: vi.fn().mockResolvedValue("TEST-ticket"),
  };
  const handle = createTicketHandler(backend, [origin]);
  for (let i = 0; i < 250; i++) {
    expect(
      (
        await handle(
          new Request("https://gateway.test", {
            method: "OPTIONS",
            headers: { origin },
          }),
        )
      ).status,
    ).toBe(204);
  }
  expect(
    (await handle(request({ ...input, challenge: "1".repeat(64) }))).status,
  ).toBe(200);
});

it("bounds concurrent ticket signing and frees slots when signing fails", async () => {
  const resolvers: (() => void)[] = [];
  const backend = {
    consumeQuota: vi.fn().mockResolvedValue(true),
    authorize: vi.fn().mockResolvedValue("write"),
    sign: vi.fn(
      () =>
        new Promise<string>((_resolve, reject) =>
          resolvers.push(() => reject(new Error("TEST private detail"))),
        ),
    ),
  };
  const handle = createTicketHandler(backend, [origin]);
  const body = { ...input, challenge: "1".repeat(64) };
  const calls = Array.from({ length: 8 }, () => handle(request(body)));
  await vi.waitFor(() => expect(backend.sign).toHaveBeenCalledTimes(8));
  expect((await handle(request(body))).status).toBe(429);
  expect(backend.authorize).toHaveBeenCalledTimes(8);
  resolvers.forEach((resolve) => resolve());
  const responses = await Promise.all(calls);
  for (const response of responses) {
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private detail");
  }
  backend.sign.mockResolvedValue("TEST-ticket");
  expect((await handle(request(body))).status).toBe(200);
});

it("roundtrips actual AES codec with bounded and default decompression", async () => {
  const key = await generateEncryptionKey();
  const bytes = new Uint8Array(40000).fill(65);
  const encoded = await compressData(bytes, {
    encryptionKey: key,
    metadata: { id: "TEST" },
  });
  const bounded = await decompressData(encoded, {
    decryptionKey: key,
    maxDecompressedBytes: 65536,
  });
  const legacy = await decompressData(encoded, { decryptionKey: key });
  expect(bounded).toEqual(legacy);
  expect(bounded.data).toEqual(bytes);
});

it("stops high compression output and does not log metadata", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const key = await generateEncryptionKey();
  const encoded = await compressData(new Uint8Array(8 * 1024 * 1024), {
    encryptionKey: key,
    metadata: { id: "TEST" },
  });
  expect(encoded.byteLength).toBeLessThan(20000);
  await expect(
    decompressData(encoded, {
      decryptionKey: key,
      maxDecompressedBytes: 65536,
    }),
  ).rejects.toThrow("exceeds limit");
  expect(log).not.toHaveBeenCalled();
});

it.each([0, -1, 1.5, NaN, Infinity])(
  "rejects invalid decompression limit %s",
  async (limit) => {
    await expect(
      decompressData(new Uint8Array(), {
        decryptionKey: "invalid",
        maxDecompressedBytes: limit,
      }),
    ).rejects.toThrow("Invalid decompression limit");
  },
);

// Build only the existing length-prefixed binary envelope, not a scene schema.
const wrap = (...chunks: Uint8Array[]) => {
  const output = new Uint8Array(
    4 + chunks.reduce((sum, chunk) => sum + 4 + chunk.length, 0),
  );
  const view = new DataView(output.buffer);
  view.setUint32(0, 1);
  let cursor = 4;
  for (const chunk of chunks) {
    view.setUint32(cursor, chunk.length);
    output.set(chunk, cursor + 4);
    cursor += chunk.length + 4;
  }
  return output;
};

it("enforces exact compressed output boundary including metadata", async () => {
  const key = await generateEncryptionKey();
  const data = new Uint8Array(20000).fill(65);
  const metadata = { id: "TEST" };
  const length = wrap(
    new TextEncoder().encode(JSON.stringify(metadata)),
    data,
  ).length;
  const encoded = await compressData(data, { encryptionKey: key, metadata });
  expect(
    (
      await decompressData(encoded, {
        decryptionKey: key,
        maxDecompressedBytes: length,
      })
    ).data,
  ).toEqual(data);
  await expect(
    decompressData(encoded, {
      decryptionKey: key,
      maxDecompressedBytes: length - 1,
    }),
  ).rejects.toThrow("exceeds limit");
});

it("rejects an authenticated but truncated compressed stream", async () => {
  const key = await generateEncryptionKey();
  const plaintext = wrap(new TextEncoder().encode("{}"), new Uint8Array(1000));
  const compressed = deflate(plaintext).slice(0, -4);
  const { encryptedBuffer, iv } = await encryptData(
    key,
    compressed as Uint8Array<ArrayBuffer>,
  );
  const encoded = wrap(
    new TextEncoder().encode(
      JSON.stringify({
        version: 2,
        compression: "pako@1",
        encryption: "AES-GCM",
      }),
    ),
    iv,
    new Uint8Array(encryptedBuffer),
  );
  await expect(
    decompressData(encoded, {
      decryptionKey: key,
      maxDecompressedBytes: 65536,
    }),
  ).rejects.toThrow("Invalid compressed data");
});

it("bounds uncompressed legacy plaintext including wrapper bytes", async () => {
  const key = await generateEncryptionKey();
  const data = new Uint8Array(64).fill(65);
  const plaintext = wrap(new TextEncoder().encode("{}"), data);
  const { encryptedBuffer, iv } = await encryptData(key, plaintext);
  const encoded = wrap(
    new TextEncoder().encode(
      JSON.stringify({ version: 2, encryption: "AES-GCM", compression: null }),
    ),
    iv,
    new Uint8Array(encryptedBuffer),
  );
  await expect(
    decompressData(encoded, {
      decryptionKey: key,
      maxDecompressedBytes: plaintext.length - 1,
    }),
  ).rejects.toThrow("exceeds limit");
  expect(
    (
      await decompressData(encoded, {
        decryptionKey: key,
        maxDecompressedBytes: plaintext.length,
      })
    ).data,
  ).toEqual(data);
});
