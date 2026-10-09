import assert from "node:assert/strict";
import { test } from "node:test";

import {
  checkAnonymousAccess,
  validatePublicConfig,
} from "./check-anonymous-access.mjs";

const projectRef = "aaaaaaaaaaaaaaaaaaaa";
const config = {
  url: `https://${projectRef}.supabase.co`,
  key: "sb_publishable_synthetic_test_value",
  projectRef,
};
const legacyToken = (role) =>
  `e30.${Buffer.from(JSON.stringify({ role })).toString(
    "base64url",
  )}.synthetic`;

test("accepts public keys but refuses privileged or malformed credentials", () => {
  validatePublicConfig(config);
  validatePublicConfig({ ...config, key: legacyToken("anon") });
  for (const role of ["authenticated", "admin", "service_role"]) {
    assert.throws(() =>
      validatePublicConfig({ ...config, key: legacyToken(role) }),
    );
  }
  for (const key of [
    undefined,
    "",
    "invalid",
    "sb_publishable_",
    "sb_secret_synthetic_value",
  ]) {
    assert.throws(() => validatePublicConfig({ ...config, key }));
  }
});

test("rejects a mismatched project, non-HTTPS URL or embedded credentials", () => {
  for (const url of [
    "invalid",
    "http://aaaaaaaaaaaaaaaaaaaa.supabase.co",
    "https://bbbbbbbbbbbbbbbbbbbb.supabase.co",
    "https://aaaaaaaaaaaaaaaaaaaa.supabase.co:444",
    "https://synthetic@aaaaaaaaaaaaaaaaaaaa.supabase.co",
    `${config.url}/other`,
    `${config.url}?other=true`,
    `${config.url}#other`,
  ]) {
    assert.throws(() => validatePublicConfig({ ...config, url }));
  }
  assert.throws(() =>
    validatePublicConfig({ ...config, projectRef: undefined }),
  );
});

test("invalid configuration never makes a request", async () => {
  let requests = 0;
  await assert.rejects(
    checkAnonymousAccess({ ...config, key: "invalid" }, async () => {
      requests += 1;
    }),
  );
  assert.equal(requests, 0);
});

test("only performs anonymous GETs and sanitizes permission-denied output", async () => {
  const endpoints = [];
  const results = await checkAnonymousAccess(config, async (url, options) => {
    endpoints.push(url.pathname);
    assert.equal(options.method, "GET");
    assert.deepEqual(options.headers, { apikey: config.key });
    assert.equal(url.searchParams.get("limit"), "1");
    assert.ok(options.signal instanceof AbortSignal);
    return new Response(
      JSON.stringify({ code: "42501", message: "synthetic-private-message" }),
      { status: 401 },
    );
  });
  assert.deepEqual(endpoints, [
    "/rest/v1/drawings",
    "/rest/v1/drawing_files",
    "/rest/v1/drawing_revisions",
  ]);
  assert.ok(results.every((result) => result.outcome === "permission-denied"));
  assert.ok(!JSON.stringify(results).includes(config.key));
  assert.ok(!JSON.stringify(results).includes("synthetic-private-message"));
});

test("does not mistake empty rows, schema errors or invalid auth for denial", async () => {
  for (const [status, body] of [
    [200, []],
    [404, { code: "42501" }],
    [500, { code: "42501" }],
    [401, { code: "invalid-auth" }],
  ]) {
    const results = await checkAnonymousAccess(
      config,
      async () => new Response(JSON.stringify(body), { status }),
    );
    assert.ok(
      results.every((result) => result.outcome === "unexpected-response"),
    );
  }
});

test("handles rejected transport and non-JSON errors without logging them", async () => {
  const failed = await checkAnonymousAccess(config, async () => {
    throw new Error("synthetic-private-transport-message");
  });
  assert.ok(failed.every((result) => result.outcome === "request-failed"));
  assert.ok(!JSON.stringify(failed).includes("synthetic-private"));
  const invalid = await checkAnonymousAccess(
    config,
    async () => new Response("synthetic-private-body", { status: 403 }),
  );
  assert.ok(
    invalid.every((result) => result.outcome === "unexpected-response"),
  );
});
