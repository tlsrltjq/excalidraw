// @ts-ignore Deno requires explicit extensions; checked separately with deno check.
import { createRequestBudget } from "../_shared/requestBudget.ts";

export type TicketRequest = {
  roomId: string;
  inviteId: string;
  proof: string;
  challenge: string;
};
export type TicketBackend = {
  consumeQuota(): Promise<boolean>;
  authorize(input: TicketRequest): Promise<"read" | "write" | null>;
  sign(
    context: { roomId: string; origin: string; challenge: string },
    scope: "read" | "write",
  ): Promise<string>;
};
class RequestError extends Error {
  constructor(public status: number) {
    super("Ticket request rejected");
  }
}
const readInput = async (request: Request): Promise<TicketRequest> => {
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    throw new RequestError(415);
  }
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > 4096)) {
    throw new RequestError(413);
  }
  const reader = request.body?.getReader();
  if (!reader) {
    throw new RequestError(400);
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    void reader.cancel().catch(() => {});
  }, 10000);
  let value: unknown;
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
      if (total > 4096) {
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
      value = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      );
    } catch {
      throw new RequestError(400);
    }
  } finally {
    clearTimeout(timer);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RequestError(400);
  }
  const input = value as Record<string, unknown>;
  if (
    Object.keys(input).some(
      (name) => !["roomId", "inviteId", "proof", "challenge"].includes(name),
    ) ||
    typeof input.roomId !== "string" ||
    !/^sc_[a-f0-9]{20}$/.test(input.roomId) ||
    typeof input.inviteId !== "string" ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
      input.inviteId,
    ) ||
    typeof input.proof !== "string" ||
    !/^[a-f0-9]{64}$/.test(input.proof) ||
    typeof input.challenge !== "string" ||
    !/^[a-f0-9]{64}$/.test(input.challenge)
  ) {
    throw new RequestError(400);
  }
  return input as TicketRequest;
};

export const createTicketHandler = (
  backend: TicketBackend,
  origins: readonly string[],
) => {
  const budget = createRequestBudget(240, 8);
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get("origin");
    const headers = new Headers({
      "cache-control": "no-store",
      vary: "Origin",
    });
    if (!origin || !origins.includes(origin)) {
      return new Response(null, { status: 403, headers });
    }
    headers.set("access-control-allow-origin", origin);
    headers.set("access-control-allow-methods", "POST, OPTIONS");
    headers.set(
      "access-control-allow-headers",
      "authorization, apikey, content-type, x-client-info",
    );
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }
    if (request.method !== "POST") {
      return new Response(null, { status: 405, headers });
    }
    headers.set("content-type", "application/json");
    const slot = budget.acquire();
    if ("retryAfter" in slot) {
      headers.set("retry-after", String(slot.retryAfter));
      return new Response(null, { status: 429, headers });
    }
    try {
      if (!(await backend.consumeQuota())) {
        headers.set("retry-after", "60");
        throw new RequestError(429);
      }
      const input = await readInput(request);
      const scope = await backend.authorize(input);
      if (scope !== "read" && scope !== "write") {
        throw new RequestError(403);
      }
      const ticket = await backend.sign(
        { roomId: input.roomId, origin, challenge: input.challenge },
        scope,
      );
      return new Response(JSON.stringify({ ticket }), { headers });
    } catch (error) {
      return new Response(JSON.stringify({ error: "Ticket request failed" }), {
        status: error instanceof RequestError ? error.status : 503,
        headers,
      });
    } finally {
      slot.release();
    }
  };
};
