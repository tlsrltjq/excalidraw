import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const container = `personal-cloud-collab-test-${process.pid}`;
const docker = (args) =>
  execFileSync("docker", args, { encoding: "utf8", timeout: 60000 });
const sql = (input) =>
  new Promise((resolve, reject) => {
    const child = spawn(
      "docker",
      [
        "exec",
        "-i",
        container,
        "psql",
        "-U",
        "postgres",
        "-qtAX",
        "-v",
        "ON_ERROR_STOP=1",
      ],
      { timeout: 30000 },
    );
    let output = "";
    let error = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      error += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve(output)
        : reject(new Error(`Local SQL test failed: ${error}`)),
    );
    child.stdin.end(input);
  });

try {
  docker([
    "run",
    "--rm",
    "-d",
    "--network",
    "none",
    "--name",
    container,
    "-e",
    "POSTGRES_HOST_AUTH_METHOD=trust",
    "postgres:16",
  ]);
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      // The image's temporary initialization server listens only on its socket.
      docker([
        "exec",
        container,
        "pg_isready",
        "-h",
        "127.0.0.1",
        "-U",
        "postgres",
      ]);
      ready = true;
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  assert.ok(ready, "Disposable PostgreSQL must be ready");
  await sql(
    readFileSync(
      `${root}personal-cloud-harness/collab-local-bootstrap.sql`,
      "utf8",
    ),
  );
  await sql(
    readFileSync(
      `${root}supabase/migrations/20261013150000_create_collab_scene_rpc.sql`,
      "utf8",
    ),
  );
  await sql(
    readFileSync(
      `${root}personal-cloud-harness/collab-files-local-bootstrap.sql`,
      "utf8",
    ),
  );
  await sql(
    readFileSync(
      `${root}supabase/migrations/20261014110000_create_collab_files_bucket.sql`,
      "utf8",
    ),
  );
  const fileResults = await sql(
    readFileSync(
      `${root}personal-cloud-harness/check-collab-files-policy.sql`,
      "utf8",
    ),
  );
  assert.equal(
    fileResults.split("\n").filter((line) => line.startsWith("PASS:")).length,
    11,
  );
  assert.equal(
    (await sql("select count(*) from storage.objects;")).trim(),
    "0",
  );
  process.stdout.write(
    "PASS: 11 private bucket policy assertions and rollback (local schema stub)\n",
  );
  const results = await sql(
    readFileSync(
      `${root}personal-cloud-harness/check-collab-scene-access.sql`,
      "utf8",
    ),
  );
  const assertions = results
    .split("\n")
    .filter((line) => line.startsWith("PASS:"));
  assert.equal(assertions.length, 28);
  process.stdout.write(
    `PASS: ${assertions.length} local DB access/CAS assertions (rolled back)\n`,
  );
  assert.equal(
    (
      await sql(
        "select count(*) from public.collab_rooms; select count(*) from public.collab_scenes; select count(*) from auth.users;",
      )
    ).trim(),
    "0\n0\n0",
  );
  process.stdout.write("PASS: rollback preserves an empty fixture DB\n");
  await sql(`
    insert into auth.users(id) values ('00000000-0000-4000-8000-000000000011');
    set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000011';
    set role authenticated;
    select public.collab_create_room('sc_aaaaaaaaaaaaaaaaaaaa');
    select public.collab_issue_invite('sc_aaaaaaaaaaaaaaaaaaaa', '00000000-0000-4000-8000-000000000001', encode(sha256(convert_to(repeat('0',64),'UTF8')),'hex'), 'write', now()+interval '1 day');
  `);
  const save = `set role anon; select public.collab_cas_scene('sc_aaaaaaaaaaaaaaaaaaaa','00000000-0000-4000-8000-000000000001',repeat('0',64),null,'AAAAAAAAAAAAAAAAAAAAAA==','AAAAAAAAAAAAAAAA',0);`;
  const race = await Promise.all([sql(save), sql(save)]);
  const statuses = race.map((value) => JSON.parse(value.trim()).status).sort();
  assert.deepEqual(statuses, ["conflict", "saved"]);
  assert.equal(
    (await sql("select revision from public.collab_scenes;")).trim(),
    "1",
  );
  process.stdout.write(
    "PASS: two real PostgreSQL clients create only one CAS revision\n",
  );
} finally {
  docker(["rm", "-f", container]);
}
