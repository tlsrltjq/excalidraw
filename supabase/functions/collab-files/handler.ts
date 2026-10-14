export const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_REQUEST_BYTES = 6 * 1024 * 1024;
const ID = /^[A-Za-z0-9_-]{1,128}$/;
const UUID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

export type FileRequest = {
  roomId: string;
  inviteId: string;
  proof: string;
  fileId: string;
  action: "upload" | "download";
  data?: string;
};
export type FileBackend = {
  authorize(input: FileRequest): Promise<"read" | "write" | null>;
  upload(path: string, bytes: Uint8Array<ArrayBuffer>): Promise<void>;
  download(path: string): Promise<Uint8Array<ArrayBuffer> | null>;
};
class RequestError extends Error {
  constructor(public status: number) {
    super("File request rejected");
  }
}

const readBody = async (request: Request) => {
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    throw new RequestError(415);
  }
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_REQUEST_BYTES)) {
    throw new RequestError(413);
  }
  if (!request.body) {
    throw new RequestError(400);
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    void reader.cancel().catch(() => {});
  }, 15000);
  try {
    while (true) {
      const chunk = await reader.read();
      if (timedOut) {
        throw new RequestError(408);
      }
      if (chunk.done) {
        break;
      }
      total += chunk.value.byteLength;
      if (total > MAX_REQUEST_BYTES) {
        throw new RequestError(413);
      }
      chunks.push(chunk.value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    try {
      return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    } catch {
      throw new RequestError(400);
    }
  } finally {
    clearTimeout(timer);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
};

const validate = (value: unknown): FileRequest => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RequestError(400);
  }
  const input = value as Record<string, unknown>;
  if (
    Object.keys(input).some(
      (key) =>
        !["action", "roomId", "inviteId", "proof", "fileId", "data"].includes(
          key,
        ),
    ) ||
    typeof input.roomId !== "string" ||
    !/^sc_[a-f0-9]{20}$/.test(input.roomId) ||
    typeof input.inviteId !== "string" ||
    !UUID.test(input.inviteId) ||
    typeof input.proof !== "string" ||
    !/^[a-f0-9]{64}$/.test(input.proof) ||
    typeof input.fileId !== "string" ||
    !ID.test(input.fileId) ||
    !["upload", "download"].includes(input.action as string) ||
    (input.action === "download" && input.data !== undefined) ||
    (input.action === "upload" && typeof input.data !== "string")
  ) {
    throw new RequestError(400);
  }
  return input as FileRequest;
};

export const createFileHandler =
  (backend: FileBackend, allowedOrigins: readonly string[]) =>
  async (request: Request): Promise<Response> => {
    const origin = request.headers.get("origin");
    const headers = new Headers({
      "cache-control": "no-store",
      vary: "Origin",
    });
    if (!origin || !allowedOrigins.includes(origin)) {
      return new Response(null, { status: 403, headers });
    }
    headers.set("access-control-allow-origin", origin);
    headers.set(
      "access-control-allow-headers",
      "authorization, apikey, content-type, x-client-info",
    );
    headers.set("access-control-allow-methods", "POST, OPTIONS");
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }
    if (request.method !== "POST") {
      return new Response(null, { status: 405, headers });
    }
    try {
      const input = validate(await readBody(request));
      const scope = await backend.authorize(input);
      if (
        (scope !== "read" && scope !== "write") ||
        (input.action === "upload" && scope !== "write")
      ) {
        throw new RequestError(403);
      }
      const path = `${input.roomId}/${input.fileId}`;
      if (input.action === "download") {
        const bytes = await backend.download(path);
        if (!bytes) {
          throw new RequestError(404);
        }
        if (!bytes.byteLength || bytes.byteLength > MAX_FILE_BYTES) {
          throw new RequestError(502);
        }
        headers.set("content-type", "application/octet-stream");
        return new Response(bytes, { headers });
      }
      const encoded = input.data!;
      if (encoded.length > Math.ceil(MAX_FILE_BYTES / 3) * 4) {
        throw new RequestError(413);
      }
      let binary: string;
      try {
        binary = atob(encoded);
      } catch {
        throw new RequestError(400);
      }
      if (
        !binary.length ||
        binary.length > MAX_FILE_BYTES ||
        btoa(binary) !== encoded
      ) {
        throw new RequestError(400);
      }
      await backend.upload(
        path,
        Uint8Array.from(binary, (char) => char.charCodeAt(0)),
      );
      headers.set("content-type", "application/json");
      return new Response(JSON.stringify({ ok: true }), { headers });
    } catch (error) {
      headers.set("content-type", "application/json");
      return new Response(JSON.stringify({ error: "File request failed" }), {
        status: error instanceof RequestError ? error.status : 503,
        headers,
      });
    }
  };
