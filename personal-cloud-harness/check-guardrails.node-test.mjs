import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(
  new URL("./check-guardrails.mjs", import.meta.url),
);
const variable = ["SUPABASE", "SERVICE", "ROLE", "KEY"].join("_");
const fixtures = [
  {
    name: "server env lookup allowed",
    path: "supabase/functions/test/index.ts",
    content: `const value = Deno.env.get("${variable}");`,
    status: 0,
  },
  {
    name: "browser env lookup denied",
    path: "excalidraw-app/cloud/test.ts",
    content: `const value = Deno.env.get("${variable}");`,
    status: 1,
  },
  {
    name: "server credential literal denied",
    path: "supabase/functions/test/index.ts",
    content: `const ${variable.toLowerCase()} = "TEST-not-a-key";`,
    status: 1,
  },
  {
    name: "VITE credential denied even on server",
    path: "supabase/functions/test/index.ts",
    content: `const name = "${["VITE", "SERVICE", "ROLE", "KEY"].join("_")}";`,
    status: 1,
  },
];
for (const fixture of fixtures) {
  test(fixture.name, () => {
    const cwd = mkdtempSync(join(tmpdir(), "personal-cloud-guardrails-"));
    try {
      execFileSync("git", ["init", "--quiet"], { cwd });
      const path = join(cwd, fixture.path);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, fixture.content);
      const result = spawnSync(process.execPath, [script], {
        cwd,
        encoding: "utf8",
      });
      assert.equal(result.status, fixture.status);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
}
