import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import net from "node:net";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { io } from "socket.io-client";

const repo = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../excalidraw-room",
);
const { Budget, Capacity, LIMITS, wireBytes } = createRequire(import.meta.url)(
  path.join(repo, "dist/limits.js"),
);
const origin = "http://127.0.0.1:3001";
const room = "a".repeat(20);
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const event = (socket, name) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(name, listener);
      reject(new Error(`Timed out: ${name}`));
    }, 5000);
    const listener = (...args) => {
      clearTimeout(timer);
      resolve(args);
    };
    socket.once(name, listener);
  });
const start = async () => {
  const port = await new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const chosen = probe.address().port;
      probe.close(() => resolve(chosen));
    });
  });
  const child = spawn(process.execPath, ["dist/index.js"], {
    cwd: repo,
    env: {
      ...process.env,
      DEBUG: "*",
      NODE_ENV: "development",
      HOST: "127.0.0.1",
      PORT: String(port),
      CORS_ORIGIN: origin,
      COLLAB_TICKET_PUBLIC_JWK: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  child.stdout.on("data", (chunk) => {
    logs += chunk;
  });
  child.stderr.on("data", (chunk) => {
    logs += chunk;
  });
  const sockets = [];
  const endpoint = `http://127.0.0.1:${port}`;
  const stop = async () => {
    sockets.forEach((socket) => socket.close());
    if (child.exitCode !== null || child.signalCode !== null) {
      return;
    }
    const exited = new Promise((resolve) => child.once("exit", resolve));
    child.kill("SIGTERM");
    const timer = setTimeout(() => child.kill("SIGKILL"), 3000);
    await exited;
    clearTimeout(timer);
  };
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      if (child.exitCode !== null) {
        throw new Error("Test relay exited");
      }
      try {
        if (
          (
            await fetch(`${endpoint}/health`, {
              signal: AbortSignal.timeout(500),
            })
          ).ok
        ) {
          ready = true;
          break;
        }
      } catch {
        /* Waiting for loopback startup. */
      }
      await pause(30);
    }
    assert.ok(ready);
  } catch (error) {
    await stop();
    throw error;
  }
  const socket = () => {
    const value = io(endpoint, {
      autoConnect: false,
      transports: ["websocket"],
      reconnection: false,
      extraHeaders: { Origin: origin },
    });
    sockets.push(value);
    return value;
  };
  return {
    endpoint,
    stop,
    socket,
    logs: () => logs,
    async connect() {
      const value = socket();
      const ready = event(value, "init-room");
      value.connect();
      await ready;
      return value;
    },
  };
};
const join = async (socket) => {
  const changed = event(socket, "room-user-change");
  socket.emit("join-room", room);
  await changed;
};

test("budget boundaries, weighted fanout, clock recovery and invalid costs", () => {
  let time = 0;
  const budget = new Budget(10, 1000, () => time);
  assert.equal(budget.take(6), true);
  assert.equal(budget.take(5), false);
  assert.equal(budget.take(4), true);
  for (const invalid of [-1, NaN, Infinity, 0.5]) {
    assert.equal(budget.take(invalid), false);
  }
  assert.equal(budget.take(1), false);
  time = 1000;
  assert.equal(budget.take(2 * 5), true);
  assert.equal(budget.take(), false);
  time = 500;
  assert.equal(budget.take(), false);
  time = 2000;
  assert.equal(budget.take(), true);
  assert.equal(wireBytes("한"), 3);
  assert.equal(wireBytes(new Uint8Array(12)), 12);
  assert.equal(wireBytes({}), LIMITS.frameBytes + 1);
  const pool = new Capacity(4);
  const release = pool.acquire(3);
  assert.ok(release);
  assert.equal(pool.acquire(2), null);
  release();
  release();
  assert.ok(pool.acquire(4));
  assert.equal(pool.acquire(), null);
});

test(
  "parallel handshakes reserve capacity before async admission",
  { timeout: 15000 },
  async () => {
    const relay = await start();
    try {
      const outcomes = await Promise.all(
        Array.from(
          { length: 80 },
          () =>
            new Promise((resolve) => {
              const socket = relay.socket();
              socket.once("init-room", () => resolve(true));
              socket.once("connect_error", () => resolve(false));
              socket.connect();
            }),
        ),
      );
      assert.equal(outcomes.filter(Boolean).length, LIMITS.connections);
    } finally {
      await relay.stop();
    }
  },
);

test(
  "a stalled polling reader is removed without disconnecting healthy senders",
  { timeout: 15000 },
  async () => {
    const relay = await start();
    try {
      const peers = [];
      for (let i = 0; i < 3; i++) {
        const peer = await relay.connect();
        await join(peer);
        peers.push(peer);
      }
      const base = `${relay.endpoint}/socket.io/?EIO=4&transport=polling`;
      const headers = {
        Origin: origin,
        "Content-Type": "text/plain;charset=UTF-8",
      };
      const open = await (await fetch(base, { headers })).text();
      const sid = JSON.parse(open.slice(1)).sid;
      const url = `${base}&sid=${encodeURIComponent(sid)}`;
      await fetch(url, { method: "POST", headers, body: "40" });
      const welcome = await (await fetch(url, { headers })).text();
      assert.ok(welcome.includes("init-room"));
      const membership = event(peers[0], "room-user-change");
      await fetch(url, {
        method: "POST",
        headers,
        body: `42${JSON.stringify(["join-room", room])}`,
      });
      assert.equal((await membership)[0].length, 4);
      const bytes = new Uint8Array(1024 * 1024);
      for (let i = 0; i < 3; i++) {
        const received = event(peers[2], "client-broadcast");
        peers[i % 2].emit("server-broadcast", room, bytes, new Uint8Array(12));
        await received;
      }
      const removed = event(peers[0], "room-user-change");
      peers[1].emit("server-broadcast", room, bytes, new Uint8Array(12));
      assert.equal((await removed)[0].length, 3);
      peers.forEach((peer) => assert.equal(peer.connected, true));
      const resumed = event(peers[2], "client-broadcast");
      peers[0].emit(
        "server-broadcast",
        room,
        new Uint8Array([9]),
        new Uint8Array(12),
      );
      assert.deepEqual(Buffer.from((await resumed)[0]), Buffer.from([9]));
    } finally {
      await relay.stop();
    }
  },
);

test(
  "unjoined socket expires while a joined idle peer stays connected",
  { timeout: 35000 },
  async () => {
    const relay = await start();
    try {
      const joined = await relay.connect();
      await join(joined);
      const idle = await relay.connect();
      await new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("Unjoined idle connection remained open")),
          32000,
        );
        idle.once("disconnect", () => {
          clearTimeout(timer);
          resolve();
        });
      });
      assert.equal(joined.connected, true);
    } finally {
      await relay.stop();
    }
  },
);

test("malformed startup Origin is rejected without echoing configuration input", async () => {
  let logs = "";
  const child = spawn(process.execPath, ["dist/index.js"], {
    cwd: repo,
    env: {
      ...process.env,
      DEBUG: "*",
      NODE_ENV: "development",
      CORS_ORIGIN: "TEST_PRIVATE_CONFIG_VALUE",
      COLLAB_TICKET_PUBLIC_JWK: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => {
    logs += chunk;
  });
  child.stderr.on("data", (chunk) => {
    logs += chunk;
  });
  const exited = new Promise((resolve) => child.once("exit", resolve));
  const timer = setTimeout(() => child.kill("SIGKILL"), 5000);
  try {
    assert.notEqual(await exited, 0);
    assert.ok(
      logs.includes("CORS_ORIGIN must contain exact comma-separated origins"),
    );
    assert.ok(!logs.includes("TEST_PRIVATE_CONFIG_VALUE"));
  } finally {
    clearTimeout(timer);
  }
});

test(
  "connection cap rejects excess, disconnect frees capacity",
  { timeout: 20000 },
  async () => {
    const relay = await start();
    try {
      const peers = [];
      for (let i = 0; i < LIMITS.connections; i++) {
        peers.push(await relay.connect());
      }
      const extra = relay.socket();
      const denied = event(extra, "connect_error");
      extra.connect();
      await denied;
      assert.equal(extra.connected, false);
      peers[0].close();
      await pause(50);
      assert.equal((await relay.connect()).connected, true);
    } finally {
      await relay.stop();
    }
  },
);

test(
  "room cap, fanout byte rejection and payload-free DEBUG=* logs",
  { timeout: 20000 },
  async () => {
    const relay = await start();
    try {
      const peers = [];
      for (let i = 0; i < LIMITS.roomPeers; i++) {
        const socket = await relay.connect();
        await join(socket);
        peers.push(socket);
      }
      const extra = await relay.connect();
      const rejected = event(extra, "disconnect");
      extra.emit("join-room", room);
      await rejected;
      const iv = new Uint8Array(12);
      const bytes = new Uint8Array(LIMITS.ciphertextBytes).fill(65);
      for (let i = 0; i < 2; i++) {
        const received = event(peers[7], "client-broadcast");
        peers[i].emit("server-broadcast", room, bytes, iv);
        const [data] = await received;
        assert.equal(data.byteLength, bytes.length);
      }
      let delivered = false;
      peers[7].once("client-broadcast", () => {
        delivered = true;
      });
      const limited = event(peers[2], "disconnect");
      peers[2].emit("server-broadcast", room, bytes, iv);
      await limited;
      await pause(50);
      assert.equal(delivered, false);
      assert.equal(peers[7].connected, true);
      const next = await relay.connect();
      await join(next);
      next.emit("TEST_LOG_MARKER", {
        ticket: "TEST_SECRET_MARKER",
        proof: "TEST_PROOF_MARKER",
      });
      await pause(50);
      for (const value of [
        room,
        next.id,
        "TEST_LOG_MARKER",
        "TEST_SECRET_MARKER",
        "TEST_PROOF_MARKER",
      ]) {
        assert.ok(
          !relay.logs().includes(value),
          "No room/socket/payload material in protocol debug logs",
        );
      }
    } finally {
      await relay.stop();
    }
  },
);

test(
  "oversize, event floods and unfinished attachment floods disconnect only senders",
  { timeout: 20000 },
  async () => {
    const relay = await start();
    try {
      const peer = await relay.connect();
      await join(peer);
      const large = await relay.connect();
      await join(large);
      let disconnected = event(large, "disconnect");
      large.emit(
        "server-broadcast",
        room,
        new Uint8Array(LIMITS.ciphertextBytes + 1),
        new Uint8Array(12),
      );
      await disconnected;
      const spam = await relay.connect();
      await join(spam);
      disconnected = event(spam, "disconnect");
      for (let i = 0; i < LIMITS.socketEvents + 1; i++) {
        spam.emit("join-room", room);
      }
      await disconnected;
      const attachments = await relay.connect();
      disconnected = event(attachments, "disconnect");
      attachments.emit(
        "TEST_PARTIAL_ATTACHMENTS",
        ...Array.from(
          { length: LIMITS.connectionFrames + 1 },
          () => new Uint8Array(),
        ),
      );
      await disconnected;
      const fresh = await relay.connect();
      await join(fresh);
      const received = event(peer, "client-broadcast");
      fresh.emit(
        "server-broadcast",
        room,
        new Uint8Array([1, 2, 3]),
        new Uint8Array(12),
      );
      assert.deepEqual(
        Buffer.from((await received)[0]),
        Buffer.from([1, 2, 3]),
      );
    } finally {
      await relay.stop();
    }
  },
);
