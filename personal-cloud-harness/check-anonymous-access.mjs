import { pathToFileURL } from "node:url";

const tables = [
  ["drawings", "id"],
  ["drawing_files", "drawing_id"],
  ["drawing_revisions", "drawing_id"],
];

export const validatePublicConfig = ({ url, key, projectRef }) => {
  if (!/^[a-z]{20}$/.test(projectRef ?? "")) {
    throw new Error("An explicit Supabase project ref is required.");
  }
  let base;
  try {
    base = new URL(url);
  } catch {
    throw new Error("A valid public Supabase URL is required.");
  }
  if (
    base.protocol !== "https:" ||
    base.hostname !== `${projectRef}.supabase.co` ||
    base.port ||
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    base.pathname !== "/"
  ) {
    throw new Error("The URL must match the explicitly selected project.");
  }
  let publicKey =
    typeof key === "string" &&
    key.startsWith("sb_publishable_") &&
    key.length > "sb_publishable_".length;
  if (!publicKey && typeof key === "string") {
    try {
      const parts = key.split(".");
      const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString());
      publicKey = parts.length === 3 && claims.role === "anon";
    } catch {
      publicKey = false;
    }
  }
  if (!publicKey) {
    throw new Error("Only a publishable or legacy anonymous key is allowed.");
  }
  return base;
};

export const checkAnonymousAccess = async (config, request = fetch) => {
  const base = validatePublicConfig(config);
  const results = [];
  for (const [table, column] of tables) {
    try {
      const endpoint = new URL(`/rest/v1/${table}`, base);
      endpoint.searchParams.set("select", column);
      endpoint.searchParams.set("limit", "1");
      const response = await request(endpoint, {
        method: "GET",
        headers: { apikey: config.key },
        signal: AbortSignal.timeout(15000),
      });
      const body = await response.json().catch(() => null);
      const permissionDenied =
        [401, 403].includes(response.status) && body?.code === "42501";
      results.push({
        table,
        http: response.status,
        outcome: permissionDenied ? "permission-denied" : "unexpected-response",
      });
    } catch {
      results.push({ table, outcome: "request-failed" });
    }
  }
  return results;
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const projectRef = process.argv[2];
    const results = await checkAnonymousAccess({
      url: process.env.VITE_SUPABASE_URL,
      key: process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      projectRef,
    });
    for (const result of results) {
      process.stdout.write(`${JSON.stringify(result)}\n`);
    }
    if (results.some((result) => result.outcome !== "permission-denied")) {
      process.exitCode = 1;
    }
  } catch {
    console.error(
      "Check the selected project ref and public Supabase environment variables.",
    );
    process.exitCode = 1;
  }
}
