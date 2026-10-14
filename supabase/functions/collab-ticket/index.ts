import { createTicketHandler } from "./handler.ts";
import { signRelayTicket } from "./ticket.ts";

const url = Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "");
const publicKey = Deno.env.get("SUPABASE_ANON_KEY");
const privateJwk = Deno.env.get("COLLAB_TICKET_PRIVATE_JWK");
const origins = (Deno.env.get("COLLAB_ALLOWED_ORIGINS") ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

// Only the issuer imports the private key. The relay receives a public JWK.
let signingKey: CryptoKey | null = null;
try {
  if (privateJwk) {
    const jwk = JSON.parse(privateJwk);
    if (jwk.kty === "EC" && jwk.crv === "P-256" && typeof jwk.d === "string") {
      signingKey = await crypto.subtle.importKey(
        "jwk",
        jwk,
        { name: "ECDSA", namedCurve: "P-256" },
        false,
        ["sign"],
      );
    }
  }
} catch {
  // Missing/invalid configuration fails closed without printing secret material.
}

if (!url || !publicKey || !signingKey || !origins.length) {
  Deno.serve(() => new Response(null, { status: 503 }));
} else {
  const key = signingKey;
  Deno.serve(
    createTicketHandler(
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
        sign(context, scope) {
          return signRelayTicket(key, context, scope);
        },
      },
      origins,
    ),
  );
}
