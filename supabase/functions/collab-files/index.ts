import { createFileHandler, MAX_FILE_BYTES } from "./handler.ts";

// Deployment secrets stay in the Edge runtime, never in the app bundle.
const url = Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "");
const publicKey = Deno.env.get("SUPABASE_ANON_KEY");
const adminKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const origins = (Deno.env.get("COLLAB_ALLOWED_ORIGINS") ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

if (!url || !publicKey || !adminKey || !origins.length) {
  Deno.serve(() => new Response(null, { status: 503 }));
} else {
  const adminHeaders = {
    apikey: adminKey,
    authorization: `Bearer ${adminKey}`,
  };
  const endpoint = `${url.replace(/\/$/, "")}/storage/v1/object/collab-files/`;
  Deno.serve(
    createFileHandler(
      {
        async authorize(input) {
          const result = await fetch(`${url}/rest/v1/rpc/collab_check_invite`, {
            method: "POST",
            headers: {
              apikey: publicKey,
              authorization: `Bearer ${publicKey}`,
              "content-type": "application/json",
            },
            body: JSON.stringify({
              p_room_id: input.roomId,
              p_invite_id: input.inviteId,
              p_proof: input.proof,
            }),
            signal: AbortSignal.timeout(10000),
            redirect: "error",
          });
          if (result.status === 401 || result.status === 403) {
            await result.body?.cancel();
            return null;
          }
          if (!result.ok) {
            await result.body?.cancel();
            throw new Error("Authorization unavailable");
          }
          const scope: unknown = await result.json();
          if (scope !== "read" && scope !== "write") {
            throw new Error("Invalid permission");
          }
          return scope;
        },
        async upload(path, bytes) {
          const result = await fetch(endpoint + path, {
            method: "POST",
            headers: {
              ...adminHeaders,
              "content-type": "application/octet-stream",
              "x-upsert": "true",
              "cache-control": "no-store",
            },
            body: bytes,
            signal: AbortSignal.timeout(15000),
            redirect: "error",
          });
          if (!result.ok) {
            await result.body?.cancel();
            throw new Error("Upload unavailable");
          }
          await result.body?.cancel();
        },
        async download(path) {
          const result = await fetch(endpoint + path, {
            headers: adminHeaders,
            signal: AbortSignal.timeout(15000),
            redirect: "error",
          });
          if (result.status === 404 || result.status === 400) {
            await result.body?.cancel();
            return null;
          }
          if (
            !result.ok ||
            Number(result.headers.get("content-length") ?? 0) > MAX_FILE_BYTES
          ) {
            await result.body?.cancel();
            throw new Error("Download unavailable");
          }
          // Stop oversized responses before buffering their entire body.
          const reader = result.body?.getReader();
          if (!reader) {
            throw new Error("Download unavailable");
          }
          const chunks: Uint8Array[] = [];
          let length = 0;
          try {
            while (true) {
              const chunk = await reader.read();
              if (chunk.done) {
                break;
              }
              length += chunk.value.byteLength;
              if (length > MAX_FILE_BYTES) {
                throw new Error("Download too large");
              }
              chunks.push(chunk.value);
            }
          } finally {
            await reader.cancel().catch(() => {});
            reader.releaseLock();
          }
          const bytes = new Uint8Array(length);
          let offset = 0;
          for (const chunk of chunks) {
            bytes.set(chunk, offset);
            offset += chunk.byteLength;
          }
          return bytes;
        },
      },
      origins,
    ),
  );
}
