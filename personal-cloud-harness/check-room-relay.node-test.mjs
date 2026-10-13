import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import test from "node:test";

import { io } from "socket.io-client";

const endpoint = new URL(
  process.env.PERSONAL_ROOM_URL || "http://127.0.0.1:3002",
);
if (
  endpoint.protocol !== "http:" ||
  !["127.0.0.1", "localhost"].includes(endpoint.hostname) ||
  endpoint.username ||
  endpoint.password
) {
  throw new Error("This probe only supports local loopback HTTP endpoints");
}

const event = (socket, name) =>
  new Promise((resolve, reject) => {
    const listener = (...args) => {
      clearTimeout(timer);
      resolve(args);
    };
    const timer = setTimeout(() => {
      socket.off(name, listener);
      reject(new Error(`Timed out waiting for ${name}`));
    }, 5000);
    socket.once(name, listener);
  });

const noBroadcast = async (socket, send) => {
  let received = false;
  const listener = () => {
    received = true;
  };
  socket.on("client-broadcast", listener);
  try {
    send();
    await new Promise((resolve) => setTimeout(resolve, 250));
    assert.equal(received, false);
  } finally {
    socket.off("client-broadcast", listener);
  }
};

test(
  "personal room relay: real clients, encryption and reconnect",
  { timeout: 30000 },
  async (t) => {
    const sockets = [];
    const connect = async (
      origin = "http://127.0.0.1:3001",
      transport = "websocket",
    ) => {
      const socket = io(endpoint.origin, {
        autoConnect: false,
        transports: [transport],
        reconnection: false,
        extraHeaders: { Origin: origin },
      });
      sockets.push(socket);
      const initialized = event(socket, "init-room");
      socket.connect();
      await initialized;
      return socket;
    };
    const join = async (socket, room) => {
      const members = event(socket, "room-user-change");
      socket.emit("join-room", room);
      await members;
    };
    try {
      const health = await fetch(new URL("/health", endpoint));
      assert.equal(health.status, 200);
      assert.deepEqual(await health.json(), { status: "ok" });
      const room = "a".repeat(20);
      const otherRoom = "b".repeat(20);
      const a = await connect();
      const b = await connect();
      const c = await connect();
      await join(a, room);
      await join(b, room);
      await join(c, otherRoom);

      const key = await webcrypto.subtle.generateKey(
        { name: "AES-GCM", length: 128 },
        false,
        ["encrypt", "decrypt"],
      );
      const iv = webcrypto.getRandomValues(new Uint8Array(12));
      const plain = new TextEncoder().encode("synthetic relay probe");
      const encrypted = await webcrypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        key,
        plain,
      );
      const receive = async (target, send) => {
        const result = event(target, "client-broadcast");
        send();
        const [bytes, receivedIv] = await result;
        assert.deepEqual(Buffer.from(bytes), Buffer.from(encrypted));
        const restored = await webcrypto.subtle.decrypt(
          { name: "AES-GCM", iv: receivedIv },
          key,
          bytes,
        );
        assert.deepEqual(Buffer.from(restored), Buffer.from(plain));
      };
      await t.test(
        "joined peers exchange unchanged encrypted bytes",
        async () => {
          await receive(b, () =>
            a.emit("server-broadcast", room, encrypted, iv),
          );
        },
      );
      await t.test(
        "another room cannot inject reliable or volatile messages",
        async () => {
          await noBroadcast(b, () =>
            c.emit("server-broadcast", room, encrypted, iv),
          );
          await noBroadcast(b, () =>
            c.emit("server-volatile-broadcast", room, encrypted, iv),
          );
          await noBroadcast(c, () =>
            a.emit("server-broadcast", room, encrypted, iv),
          );
        },
      );
      await t.test(
        "unjoined clients and malformed binary data are ignored",
        async () => {
          const outsider = await connect();
          await noBroadcast(b, () =>
            outsider.emit("server-broadcast", room, encrypted, iv),
          );
          await noBroadcast(b, () =>
            a.emit("server-broadcast", room, "not binary", iv),
          );
          await noBroadcast(b, () =>
            a.emit("server-broadcast", room, encrypted, new Uint8Array(2)),
          );
          outsider.disconnect();
        },
      );
      await t.test(
        "same-room following works; cross-room following is ignored",
        async () => {
          const followed = event(a, "user-follow-room-change");
          b.emit("user-follow", {
            userToFollow: { socketId: a.id, username: "TEST" },
            action: "FOLLOW",
          });
          await followed;
          await receive(b, () =>
            a.emit("server-broadcast", `follow@${a.id}`, encrypted, iv),
          );
          c.emit("user-follow", {
            userToFollow: { socketId: a.id, username: "TEST" },
            action: "FOLLOW",
          });
          await noBroadcast(c, () =>
            a.emit("server-broadcast", `follow@${a.id}`, encrypted, iv),
          );
          a.emit("user-follow", null);
        },
      );
      await t.test(
        "reconnection rejoins the room with a new socket and resumes relay",
        async () => {
          const previousId = b.id;
          b.disconnect();
          const initialized = event(b, "init-room");
          b.connect();
          await initialized;
          assert.notEqual(b.id, previousId);
          await join(b, room);
          await receive(b, () =>
            a.emit("server-broadcast", room, encrypted, iv),
          );
        },
      );
      await t.test(
        "polling accepts allowed Origin; WebSocket denies foreign Origin",
        async () => {
          const polling = await connect("http://127.0.0.1:3001", "polling");
          await join(polling, otherRoom);
          polling.disconnect();
          const rejected = io(endpoint.origin, {
            autoConnect: false,
            transports: ["websocket"],
            reconnection: false,
            extraHeaders: { Origin: "https://invalid.example" },
          });
          sockets.push(rejected);
          const denied = event(rejected, "connect_error");
          rejected.connect();
          await denied;
          assert.equal(rejected.connected, false);
        },
      );
    } finally {
      sockets.forEach((socket) => socket.disconnect());
    }
  },
);
