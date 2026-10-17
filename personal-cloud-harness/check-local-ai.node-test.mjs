import assert from "node:assert/strict";
import { once } from "node:events";
import http from "node:http";
import { test } from "node:test";

import { createLocalAIBridge } from "./local-ai-bridge.mjs";

const origin = "http://127.0.0.1:3006";
const diagram = {
  version: 1,
  title: "Synthetic",
  direction: "TD",
  nodes: [{ id: "a", label: "Start", kind: "process" }],
  edges: [],
};
const fixture = async (
  run,
  chat = async () => ({
    done: true,
    message: { content: JSON.stringify(diagram) },
  }),
) => {
  const calls = [];
  const server = createLocalAIBridge({
    fetcher: async (url, options) => {
      calls.push({ url, ...options });
      const result = url.endsWith("/tags")
        ? {
            models: [
              { name: "local:tiny" },
              { name: "remote:cloud" },
              { name: "embed:small" },
            ],
          }
        : url.endsWith("/show")
        ? {
            capabilities: JSON.parse(options.body).model.startsWith("embed")
              ? ["embedding"]
              : ["completion"],
          }
        : await chat(options);
      return Response.json(result);
    },
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path, options = {}) =>
    fetch(base + path, { ...options, headers: { origin, ...options.headers } });
  const wrongHost = () =>
    new Promise((resolve, reject) => {
      http
        .get(
          base + "/session",
          { headers: { origin, host: "evil.invalid" } },
          (response) => {
            response.resume();
            resolve(response.statusCode);
          },
        )
        .on("error", reject);
    });
  try {
    await run({ request, calls, wrongHost });
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
};
const generation = (
  token,
  input = { model: "local:tiny", prompt: "Synthetic diagram" },
) => ({
  method: "POST",
  headers: { "content-type": "application/json", "x-personal-ai-token": token },
  body: JSON.stringify(input),
});

test("exact loopback origins, host and memory token gate inference", async () =>
  fixture(async ({ request, calls, wrongHost }) => {
    assert.equal(
      (
        await request("/session", {
          headers: { origin: "https://example.invalid" },
        })
      ).status,
      403,
    );
    assert.equal(await wrongHost(), 403);
    assert.equal(calls.length, 0);
    const session = await (await request("/session")).json();
    assert.deepEqual(session.models, ["local:tiny"]);
    assert.equal((await request("/generate", generation("wrong"))).status, 403);
    const response = await request("/generate", generation(session.token));
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).diagram, diagram);
    const upstream = calls.find((call) => call.url.endsWith("/chat"));
    const body = JSON.parse(upstream.body);
    assert.equal(upstream.url, "http://127.0.0.1:11434/api/chat");
    assert.equal(body.messages[1].content, "Synthetic diagram");
    assert.equal(body.stream, false);
    assert.equal(body.tools, undefined);
  }));
test("rejects model override, extra operations and oversized requests", async () =>
  fixture(async ({ request, calls }) => {
    const { token } = await (await request("/session")).json();
    for (const input of [
      { model: "remote:cloud", prompt: "x" },
      { model: "local:tiny", prompt: "x", tools: ["delete"] },
      { model: "local:tiny", prompt: "x".repeat(2001) },
    ]) {
      assert.equal(
        (await request("/generate", generation(token, input))).status,
        400,
      );
    }
    assert.equal(
      (
        await request(
          "/generate",
          generation(token, { model: "local:tiny", prompt: "x".repeat(9000) }),
        )
      ).status,
      413,
    );
    assert.equal(
      calls.some((call) => call.url.endsWith("/chat")),
      false,
    );
  }));
test("invalid model output is generic and never returned to the browser", async () =>
  fixture(
    async ({ request }) => {
      const { token } = await (await request("/session")).json();
      const response = await request("/generate", generation(token));
      assert.equal(response.status, 422);
      assert.equal(
        (await response.text()).includes("synthetic-provider-detail"),
        false,
      );
    },
    async () => ({
      done: true,
      message: { content: "synthetic-provider-detail" },
    }),
  ));
test("single-flight inference rejects concurrent requests and releases after completion", async () => {
  let started;
  let finish;
  const entered = new Promise((resolve) => {
    started = resolve;
  });
  const completion = new Promise((resolve) => {
    finish = resolve;
  });
  await fixture(
    async ({ request }) => {
      const { token } = await (await request("/session")).json();
      const first = request("/generate", generation(token));
      await entered;
      assert.equal((await request("/generate", generation(token))).status, 429);
      finish();
      assert.equal((await first).status, 200);
      assert.equal((await request("/generate", generation(token))).status, 200);
    },
    async () => {
      started();
      await completion;
      return { done: true, message: { content: JSON.stringify(diagram) } };
    },
  );
});
test("generation attempts are capped per minute", async () =>
  fixture(async ({ request }) => {
    const { token } = await (await request("/session")).json();
    for (let i = 0; i < 6; i++) {
      assert.equal((await request("/generate", generation(token))).status, 200);
    }
    const limited = await request("/generate", generation(token));
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get("retry-after"), "60");
  }));

test("browser cancellation aborts provider work", async () => {
  let started;
  let cancelled;
  const entered = new Promise((resolve) => {
    started = resolve;
  });
  const aborted = new Promise((resolve) => {
    cancelled = resolve;
  });
  await fixture(
    async ({ request }) => {
      const { token } = await (await request("/session")).json();
      const controller = new AbortController();
      const result = request("/generate", {
        ...generation(token),
        signal: controller.signal,
      }).catch(() => null);
      await entered;
      controller.abort();
      await result;
      await Promise.race([
        aborted,
        new Promise((_, reject) => {
          const timer = setTimeout(
            () => reject(new Error("Provider was not cancelled")),
            2000,
          );
          timer.unref();
        }),
      ]);
    },
    async ({ signal }) => {
      started();
      await new Promise((_, reject) =>
        signal.addEventListener(
          "abort",
          () => {
            cancelled();
            reject(new Error("aborted"));
          },
          { once: true },
        ),
      );
    },
  );
});

test("label edits send only provided aliases/text and validate returned references", async () => {
  const targets = [{ id: "t1", text: "Synthetic original" }];
  const edit = { version: 1, changes: [{ id: "t1", text: "Short" }] };
  await fixture(
    async ({ request, calls }) => {
      const { token } = await (await request("/session")).json();
      assert.equal(
        (
          await request(
            "/edit-labels",
            generation("wrong", {
              model: "local:tiny",
              prompt: "Shorten",
              targets,
            }),
          )
        ).status,
        403,
      );
      const response = await request(
        "/edit-labels",
        generation(token, { model: "local:tiny", prompt: "Shorten", targets }),
      );
      assert.equal(response.status, 200);
      assert.deepEqual((await response.json()).edit, edit);
      const body = JSON.parse(
        calls.find((call) => call.url.endsWith("/chat")).body,
      );
      assert.deepEqual(JSON.parse(body.messages[1].content), {
        instruction: "Shorten",
        targets,
      });
      assert.equal(body.tools, undefined);
      assert.equal(
        (
          await request(
            "/edit-labels",
            generation(token, {
              model: "local:tiny",
              prompt: "Shorten",
              targets: [{ id: "actual-element-id", text: "x" }],
            }),
          )
        ).status,
        422,
      );
    },
    async () => ({ done: true, message: { content: JSON.stringify(edit) } }),
  );
  await fixture(
    async ({ request }) => {
      const { token } = await (await request("/session")).json();
      assert.equal(
        (
          await request(
            "/edit-labels",
            generation(token, {
              model: "local:tiny",
              prompt: "Shorten",
              targets,
            }),
          )
        ).status,
        422,
      );
    },
    async () => ({
      done: true,
      message: {
        content: JSON.stringify({
          version: 1,
          changes: [{ id: "t2", text: "Other" }],
        }),
      },
    }),
  );
});

test("label edits and generation share the same rate budget", async () => {
  await fixture(
    async ({ request }) => {
      const { token } = await (await request("/session")).json();
      for (let i = 0; i < 6; i++) {
        assert.equal(
          (
            await request(
              "/edit-labels",
              generation(token, {
                model: "local:tiny",
                prompt: "Shorten",
                targets: [{ id: "t1", text: "Original" }],
              }),
            )
          ).status,
          200,
        );
      }
      assert.equal((await request("/generate", generation(token))).status, 429);
    },
    async () => ({
      done: true,
      message: {
        content: JSON.stringify({
          version: 1,
          changes: [{ id: "t1", text: "New" }],
        }),
      },
    }),
  );
});
