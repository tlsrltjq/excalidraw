import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const args = new Set(process.argv.slice(2));
const stagedOnly = args.has("--staged");
const allowCoreChanges = process.env.PERSONAL_CLOUD_ALLOW_CORE_CHANGES === "1";

const runGit = (gitArgs) =>
  execFileSync("git", gitArgs, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

const splitNull = (value) => value.split("\0").filter(Boolean);

const getChangedFiles = () => {
  if (stagedOnly) {
    return splitNull(
      runGit([
        "diff",
        "--cached",
        "--name-only",
        "--diff-filter=ACMR",
        "-z",
      ]),
    );
  }

  const staged = splitNull(
    runGit(["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"]),
  );
  const unstaged = splitNull(
    runGit(["diff", "--name-only", "--diff-filter=ACMR", "-z"]),
  );
  const untracked = splitNull(
    runGit(["ls-files", "--others", "--exclude-standard", "-z"]),
  );

  return [...new Set([...staged, ...unstaged, ...untracked])];
};

const readChangedFile = (file) => {
  if (stagedOnly) {
    try {
      return runGit(["show", `:${file}`]);
    } catch {
      return "";
    }
  }

  if (!existsSync(file)) {
    return "";
  }

  const content = readFileSync(file);
  return content.includes(0) ? "" : content.toString("utf8");
};

const files = getChangedFiles();
const errors = [];
const warnings = [];

const sourceFilePattern = /\.(?:[cm]?[jt]sx?|json|ya?ml|env|toml)$/i;
const secretPatterns = [
  {
    name: "private key",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  },
  {
    name: "secret-like VITE variable",
    pattern:
      /VITE_[A-Z0-9_]*(?:SERVICE_ROLE|SECRET|PRIVATE_KEY|DATABASE_PASSWORD|OPENAI_API_KEY|ANTHROPIC_API_KEY)/,
  },
  {
    name: "Supabase service role in browser source",
    pattern: /(?:service[_-]?role).{0,40}(?:key|token)/i,
  },
];

const coreChanges = files.filter((file) => file.startsWith("packages/"));
if (coreChanges.length && !allowCoreChanges) {
  errors.push(
    [
      "Upstream core files changed without an explicit exception:",
      ...coreChanges.map((file) => `  - ${file}`),
      "Record the decision first, then rerun with PERSONAL_CLOUD_ALLOW_CORE_CHANGES=1.",
    ].join("\n"),
  );
}

for (const file of files) {
  if (
    !sourceFilePattern.test(file) ||
    file.startsWith("personal-cloud-docs/") ||
    file === "personal-cloud-harness/check-guardrails.mjs"
  ) {
    continue;
  }

  const content = readChangedFile(file);
  for (const { name, pattern } of secretPatterns) {
    if (pattern.test(content)) {
      errors.push(`${file}: found ${name}. Do not expose secrets in tracked source.`);
    }
  }

  if (
    file.startsWith("excalidraw-app/cloud/") &&
    /localStorage\.(?:getItem|setItem|removeItem)\(/.test(content)
  ) {
    warnings.push(
      `${file}: direct localStorage access in cloud code; use a drawing-scoped storage adapter.`,
    );
  }
}

for (const file of files.filter((file) => file.startsWith("supabase/migrations/"))) {
  const content = readChangedFile(file);
  if (/create\s+table\s+(?:public\.)?/i.test(content)) {
    if (!/enable\s+row\s+level\s+security/i.test(content)) {
      warnings.push(`${file}: creates a table but does not enable RLS in the same migration.`);
    }
    if (!/create\s+policy/i.test(content)) {
      warnings.push(`${file}: creates a table but does not define an RLS policy.`);
    }
  }
}

if (warnings.length) {
  console.warn("Personal Cloud guardrail warnings:\n");
  for (const warning of warnings) {
    console.warn(`- ${warning}`);
  }
  console.warn("");
}

if (errors.length) {
  console.error("Personal Cloud guardrail check failed:\n");
  for (const error of errors) {
    console.error(`${error}\n`);
  }
  process.exitCode = 1;
} else {
  console.log(`Personal Cloud guardrails passed (${files.length} changed files checked).`);
}
