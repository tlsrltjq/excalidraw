import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { webcrypto } from "node:crypto";
import { readFile } from "node:fs/promises";
import net from "node:net";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { io } from "socket.io-client";

import { signRelayTicket } from "../supabase/functions/collab-ticket/ticket.ts";
import { createRelaySession } from "../excalidraw-app/collab/persistence/relaySession.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repo = path.resolve(root, "../excalidraw-room");
const origin = "http://127.0.0.1:3001";
const room = `sc_${"a".repeat(20)}`;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const event = (socket, name) =>
  new Promise((resolve, reject) => {
    const listener = (...args) => {
      clearTimeout(timer);
      resolve(args);
    };
    const timer = setTimeout(() => {
      socket.off(name, listener);
      reject(new Error(`Timed out: ${name}`));
    }, 5000);
    socket.once(name, listener);
  });
const ack = (socket, name, ...args) =>
  new Promise((resolve, reject) => {
    socket.timeout(5000).emit(name, ...args, (error, response) => {
      if (error) {
        reject(error);
      } else {
        resolve(response);
      }
    });
  });
const absent = async (socket, name, action) => {
  let received = false;
  const listener = () => {
    received = true;
  };
  socket.on(name, listener);
  try {
    await action();
    await pause(150);
    assert.equal(received, false);
  } finally {
    socket.off(name, listener);
  }
};
const freePort = () =>
  new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
const start = async (publicJwk) => {
  const port = await freePort();
  const child = spawn(process.execPath, ["dist/index.js"], {
    cwd: repo,
    stdio: ["ignore", "ignore", "ignore"],
    env: {
      ...process.env,
      DEBUG: "",
      NODE_ENV: "development",
      HOST: "127.0.0.1",
      PORT: String(port),
      CORS_ORIGIN: origin,
      COLLAB_TICKET_PUBLIC_JWK: publicJwk ? JSON.stringify(publicJwk) : "",
    },
  });
  const endpoint = `http://127.0.0.1:${port}`;
  const stop = async () => {
    if (child.exitCode !== null || child.signalCode !== null) {
      return;
    }
    const closed = new Promise((resolve) => child.once("exit", resolve));
    child.kill("SIGTERM");
    const timer = setTimeout(() => child.kill("SIGKILL"), 3000);
    await closed;
    clearTimeout(timer);
  };
  try {
    for (let i = 0; i < 100; i++) {
      if (child.exitCode !== null) {
        throw new Error("Local test relay exited");
      }
      try {
        if (
          (
            await fetch(`${endpoint}/health`, {
              signal: AbortSignal.timeout(500),
            })
          ).ok
        ) {
          return { endpoint, stop };
        }
      } catch {
        /* Startup is still in progress. */
      }
      await pause(50);
    }
    throw new Error("Local test relay did not become ready");
  } catch (error) {
    await stop();
    throw error;
  }
};

test(
  "signed relay admission: actual local clients",
  { timeout: 45000 },
  async (t) => {
    assert.equal(
      await readFile(path.join(repo, "src/ticket.ts"), "utf8"),
      await readFile(
        path.join(root, "supabase/functions/collab-ticket/ticket.ts"),
        "utf8",
      ),
    );
    const keys = await webcrypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"],
    );
    const publicJwk = await webcrypto.subtle.exportKey("jwk", keys.publicKey);
    const relay = await start(publicJwk);
    const sockets = [];
    const challenges = new Map();
    const connect = async (endpoint = relay.endpoint) => {
      const socket = io(endpoint, {
        autoConnect: false,
        transports: ["websocket"],
        reconnection: false,
        extraHeaders: { Origin: origin },
      });
      sockets.push(socket);
      const ready = event(socket, "collab-challenge");
      socket.connect();
      const [{ challenge }] = await ready;
      assert.match(challenge, /^[a-f0-9]{64}$/);
      challenges.set(socket, challenge);
      return socket;
    };
    const ticket = (
      socket,
      scope = "write",
      roomId = room,
      now = Date.now(),
      overrides = {},
    ) =>
      signRelayTicket(
        keys.privateKey,
        { roomId, origin, challenge: challenges.get(socket), ...overrides },
        scope,
        now,
      );
    const join = async (
      socket,
      scope = "write",
      roomId = room,
      now = Date.now(),
    ) => {
      assert.deepEqual(
        await ack(socket, "join-collab-room", {
          roomId,
          ticket: await ticket(socket, scope, roomId, now),
        }),
        { ok: true },
      );
    };
    const data = new Uint8Array([1, 2, 3, 4]);
    const iv = new Uint8Array(12);
    const receive = async (from, to, roomId = room) => {
      const received = event(to, "client-broadcast");
      from.emit("server-broadcast", roomId, data, iv);
      const [bytes, receivedIv] = await received;
      assert.deepEqual(Buffer.from(bytes), Buffer.from(data));
      assert.equal(receivedIv.byteLength, 12);
    };
    try {
      const a = await connect();
      const b = await connect();
      const reader = await connect();
      await join(a);
      await join(b);
      await join(reader, "read");
      await t.test(
        "write peers exchange bytes both ways; readers receive",
        async () => {
          await receive(a, b);
          await receive(b, a);
          await receive(a, reader);
        },
      );
      await t.test(
        "read scope cannot broadcast reliably/volatile or follow",
        async () => {
          await absent(a, "client-broadcast", () =>
            reader.emit("server-broadcast", room, data, iv),
          );
          await absent(a, "client-broadcast", () =>
            reader.emit("server-volatile-broadcast", room, data, iv),
          );
          await absent(a, "user-follow-room-change", () =>
            reader.emit("user-follow", {
              action: "FOLLOW",
              userToFollow: { socketId: a.id, username: "TEST" },
            }),
          );
          const followed = event(a, "user-follow-room-change");
          b.emit("user-follow", {
            action: "FOLLOW",
            userToFollow: { socketId: a.id, username: "TEST" },
          });
          await followed;
          await receive(a, b, `follow@${a.id}`);
        },
      );
      await t.test(
        "denies missing/tampered/expired/cross-origin/socket/room tickets and extra fields",
        async () => {
          const outsider = await connect();
          const valid = await ticket(outsider);
          const bad = [
            "",
            `${valid}!`,
            await ticket(outsider, "write", room, Date.now() - 61000),
            await ticket(a),
            await ticket(outsider, "write", room, Date.now(), {
              origin: "https://other.test",
            }),
            await ticket(outsider, "write", `sc_${"b".repeat(20)}`),
          ];
          for (const candidate of bad) {
            assert.deepEqual(
              await ack(outsider, "join-collab-room", {
                roomId: room,
                ticket: candidate,
              }),
              { ok: false },
            );
          }
          assert.deepEqual(
            await ack(outsider, "join-collab-room", {
              roomId: room,
              ticket: valid,
              scope: "write",
            }),
            { ok: false },
          );
          await absent(a, "client-broadcast", () =>
            outsider.emit("server-broadcast", room, data, iv),
          );
          await join(outsider);
          outsider.disconnect();
        },
      );
      await t.test(
        "cannot bypass new admission via legacy join or another canvas",
        async () => {
          const outsider = await connect();
          outsider.emit("join-room", room);
          await absent(a, "client-broadcast", () =>
            outsider.emit("server-broadcast", room, data, iv),
          );
          const other = `sc_${"c".repeat(20)}`;
          await join(outsider, "write", other);
          await absent(a, "client-broadcast", () =>
            outsider.emit("server-broadcast", room, data, iv),
          );
          await absent(outsider, "client-broadcast", () =>
            a.emit("server-broadcast", room, data, iv),
          );
          await absent(a, "user-follow-room-change", () =>
            outsider.emit("user-follow", {
              action: "FOLLOW",
              userToFollow: { socketId: a.id, username: "TEST" },
            }),
          );
          outsider.disconnect();
        },
      );
      await t.test("concurrent joins admit one canvas only", async () => {
        const socket = await connect();
        const other = `sc_${"d".repeat(20)}`;
        const first = await ticket(socket);
        const second = await ticket(socket, "write", other);
        const results = await Promise.all([
          ack(socket, "join-collab-room", { roomId: room, ticket: first }),
          ack(socket, "join-collab-room", { roomId: other, ticket: second }),
        ]);
        assert.equal(results.filter((result) => result.ok).length, 1);
        socket.disconnect();
      });
      await t.test(
        "renewal extends admission and can downgrade write to read",
        async () => {
          const socket = await connect();
          await join(socket, "write", room, Date.now() - 57000);
          assert.deepEqual(
            await ack(
              socket,
              "renew-collab-ticket",
              await ticket(socket, "read"),
            ),
            { ok: true },
          );
          assert.deepEqual(
            await ack(
              socket,
              "renew-collab-ticket",
              await ticket(socket, "write", room, Date.now() - 57000),
            ),
            { ok: false },
          );
          await pause(3200);
          assert.equal(socket.connected, true);
          await receive(a, socket);
          await absent(a, "client-broadcast", () =>
            socket.emit("server-broadcast", room, data, iv),
          );
          socket.disconnect();
        },
      );
      await t.test(
        "expiry stops idle receiving and disconnects; reconnect needs new challenge",
        async () => {
          const socket = await connect();
          const oldChallenge = challenges.get(socket);
          const oldTicket = await ticket(socket);
          await join(socket, "read", room, Date.now() - 57000);
          const expired = event(socket, "collab-expired");
          const disconnected = event(socket, "disconnect");
          await expired;
          await disconnected;
          const ready = event(socket, "collab-challenge");
          socket.connect();
          const [{ challenge }] = await ready;
          assert.notEqual(challenge, oldChallenge);
          challenges.set(socket, challenge);
          assert.deepEqual(
            await ack(socket, "join-collab-room", {
              roomId: room,
              ticket: oldTicket,
            }),
            { ok: false },
          );
          await join(socket);
          await receive(socket, a);
          socket.disconnect();
        },
      );
      await t.test(
        "private JWK rejected; missing key closes secure rooms without breaking legacy",
        async () => {
          const require = createRequire(import.meta.url);
          const { importRelayKey } = require(path.join(
            repo,
            "dist/admission.js",
          ));
          await assert.rejects(
            importRelayKey(
              JSON.stringify(
                await webcrypto.subtle.exportKey("jwk", keys.privateKey),
              ),
            ),
          );
          const closed = await start(null);
          try {
            const socket = await connect(closed.endpoint);
            assert.deepEqual(
              await ack(socket, "join-collab-room", {
                roomId: room,
                ticket: await ticket(socket),
              }),
              { ok: false },
            );
            const members = event(socket, "room-user-change");
            socket.emit("join-room", "e".repeat(20));
            await members;
            socket.disconnect();
          } finally {
            await closed.stop();
          }
        },
      );
      await t.test("verification attempts are limited per socket", async () => {
        const socket = await connect();
        for (let i = 0; i < 10; i++) {
          assert.deepEqual(
            await ack(socket, "join-collab-room", {
              roomId: room,
              ticket: "invalid",
            }),
            { ok: false },
          );
        }
        assert.deepEqual(
          await ack(socket, "join-collab-room", {
            roomId: room,
            ticket: await ticket(socket),
          }),
          { ok: false },
        );
        socket.disconnect();
      });
      await t.test(
        "frontend session worker joins, renews and locks a read downgrade",
        async () => {
          const socket = io(relay.endpoint, {
            autoConnect: false,
            transports: ["websocket"],
            reconnection: false,
            extraHeaders: { Origin: origin },
          });
          sockets.push(socket);
          let calls = 0;
          let firstReady;
          let renewed;
          const first = new Promise((resolve) => {
            firstReady = resolve;
          });
          const second = new Promise((resolve) => {
            renewed = resolve;
          });
          const errors = [];
          const worker = createRelaySession({
            socket,
            roomId: room,
            isCurrent: () => true,
            visibility: Object.assign(new EventTarget(), { hidden: false }),
            async requestTicket(challenge, isCurrent, signal) {
              calls++;
              assert.equal(isCurrent(), true);
              assert.equal(signal.aborted, false);
              const scope = calls === 1 ? "write" : "read";
              const token = await signRelayTicket(
                keys.privateKey,
                { roomId: room, origin, challenge },
                scope,
                calls === 1 ? Date.now() - 29000 : Date.now(),
              );
              const claims = JSON.parse(
                Buffer.from(token.split(".")[1], "base64url").toString(),
              );
              return { ticket: token, scope, expiresAt: claims.exp * 1000 };
            },
            onPending() {},
            onReady(scope) {
              if (scope === "write") {
                firstReady();
              } else {
                renewed();
              }
            },
            onError(message) {
              errors.push(message);
            },
          });
          try {
            socket.connect();
            await Promise.race([
              first,
              pause(5000).then(() => {
                throw new Error("Frontend worker join timeout");
              }),
            ]);
            await pause(0);
            assert.equal(worker.canWrite(), true);
            await receive(socket, a);
            await Promise.race([
              second,
              pause(5000).then(() => {
                throw new Error("Frontend worker renewal timeout");
              }),
            ]);
            await pause(0);
            assert.equal(worker.isReady(), true);
            assert.equal(worker.canWrite(), false);
            await receive(a, socket);
            await absent(a, "client-broadcast", () =>
              socket.emit("server-broadcast", room, data, iv),
            );
            assert.deepEqual(errors, []);
            assert.equal(calls, 2);
            const previousId = socket.id;
            socket.disconnect();
            assert.equal(worker.isReady(), false);
            const reconnected = event(socket, "collab-challenge");
            socket.connect();
            await reconnected;
            for (let i = 0; i < 100 && !worker.isReady(); i++) {
              await pause(20);
            }
            assert.notEqual(socket.id, previousId);
            assert.equal(worker.isReady(), true);
            assert.equal(worker.canWrite(), false);
            assert.equal(calls, 3);
            await receive(a, socket);
            assert.deepEqual(errors, []);
          } finally {
            worker.close();
          }
        },
      );
      await t.test(
        "legacy relay regression against this newly built server",
        async () => {
          const env = { ...process.env, PERSONAL_ROOM_URL: relay.endpoint };
          delete env.NODE_TEST_CONTEXT;
          const child = spawn(
            process.execPath,
            [
              "--test",
              "--test-reporter=tap",
              path.join(
                root,
                "personal-cloud-harness/check-room-relay.node-test.mjs",
              ),
            ],
            {
              cwd: root,
              env,
              stdio: ["ignore", "pipe", "ignore"],
              timeout: 35000,
            },
          );
          let output = "";
          child.stdout.on("data", (chunk) => {
            output += chunk.toString();
          });
          const exit = await new Promise((resolve, reject) => {
            child.once("error", reject);
            child.once("exit", (code) => resolve(code));
          });
          assert.equal(
            exit,
            0,
            "Legacy relay probe must pass on the new binary",
          );
          assert.match(output, /# tests 7\b/);
          assert.match(output, /# pass 7\b/);
        },
      );
    } finally {
      sockets.forEach((socket) => socket.disconnect());
      await relay.stop();
    }
  },
);
