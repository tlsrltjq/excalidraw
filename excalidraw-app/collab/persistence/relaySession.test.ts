import { createRelaySession } from "./relaySession";

import type { Socket } from "socket.io-client";
import type { RelayGrant } from "./relayTicketRequest";

const challenge = "a".repeat(64);
const sessions: Array<ReturnType<typeof createRelaySession>> = [];
const setup = () => {
  const listeners = new Map<string, Set<(...args: any[]) => void>>();
  const acknowledgements: Array<(response: unknown) => void> = [];
  let autoAck = true;
  let current = true;
  const socket = {
    connected: true,
    id: "TEST-socket",
    on: vi.fn((name, fn) => {
      if (!listeners.has(name)) {
        listeners.set(name, new Set());
      }
      listeners.get(name)!.add(fn);
    }),
    off: vi.fn((name, fn) => listeners.get(name)?.delete(fn)),
    emit: vi.fn((_name, ...args) => {
      const callback = args[args.length - 1];
      acknowledgements.push(callback);
      if (autoAck) {
        queueMicrotask(() => callback({ ok: true }));
      }
    }),
    disconnect: vi.fn(() => {
      socket.connected = false;
    }),
  };
  const server = (name: string, ...args: unknown[]) => {
    for (const listener of listeners.get(name) ?? []) {
      listener(...args);
    }
  };
  const visibility = Object.assign(new EventTarget(), { hidden: false });
  const request = vi.fn<
    (
      challenge: string,
      isCurrent: () => boolean,
      signal: AbortSignal,
    ) => Promise<RelayGrant>
  >(
    async (): Promise<RelayGrant> => ({
      ticket: "TEST-ticket",
      scope: "write",
      expiresAt: Date.now() + 60000,
    }),
  );
  const ready = vi
    .fn<(...args: any[]) => Promise<void>>()
    .mockResolvedValue(undefined);
  const error = vi.fn();
  const pending = vi.fn();
  const session = createRelaySession({
    socket: socket as unknown as Socket,
    roomId: `sc_${"a".repeat(20)}`,
    isCurrent: () => current,
    requestTicket: request,
    onReady: ready,
    onError: error,
    onPending: pending,
    visibility,
  });
  sessions.push(session);
  return {
    socket,
    server,
    visibility,
    request,
    ready,
    error,
    pending,
    session,
    acknowledgements,
    delayAck: () => {
      autoAck = false;
    },
    stale: () => {
      current = false;
    },
  };
};
const flush = () => vi.advanceTimersByTimeAsync(0);
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1700000000000);
});
afterEach(() => {
  sessions.splice(0).forEach((session) => session.close());
  vi.useRealTimers();
});

it("does not request or emit before challenge; deduplicates duplicate challenges", async () => {
  const t = setup();
  expect(t.request).not.toHaveBeenCalled();
  t.server("collab-challenge", { challenge });
  t.server("collab-challenge", { challenge });
  await flush();
  expect(t.request).toHaveBeenCalledTimes(1);
  expect(t.session.canWrite()).toBe(true);
  expect(t.socket.emit).toHaveBeenCalledWith(
    "join-collab-room",
    { roomId: `sc_${"a".repeat(20)}`, ticket: "TEST-ticket" },
    expect.any(Function),
  );
});
it("opens readiness only after server ACK and preparation callback", async () => {
  const t = setup();
  t.delayAck();
  let complete!: () => void;
  t.ready.mockReturnValue(
    new Promise((resolve) => {
      complete = resolve;
    }),
  );
  t.server("collab-challenge", { challenge });
  await flush();
  expect(t.session.isReady()).toBe(false);
  expect(t.ready).not.toHaveBeenCalled();
  t.acknowledgements[0]({ ok: true });
  await flush();
  expect(t.session.isReady()).toBe(false);
  complete();
  await flush();
  expect(t.session.isReady()).toBe(true);
});
it("read scope never enables writable state", async () => {
  const t = setup();
  t.request.mockResolvedValue({
    ticket: "TEST",
    scope: "read",
    expiresAt: Date.now() + 60000,
  });
  t.server("collab-challenge", { challenge });
  await flush();
  expect(t.session.isReady()).toBe(true);
  expect(t.session.canWrite()).toBe(false);
});
it("renews thirty seconds early and applies a read downgrade after ACK", async () => {
  const t = setup();
  t.server("collab-challenge", { challenge });
  await flush();
  t.request.mockImplementation(async () => ({
    ticket: "TEST-renewal",
    scope: "read",
    expiresAt: Date.now() + 60000,
  }));
  await vi.advanceTimersByTimeAsync(30000);
  expect(t.socket.emit).toHaveBeenLastCalledWith(
    "renew-collab-ticket",
    "TEST-renewal",
    expect.any(Function),
  );
  expect(t.ready).toHaveBeenCalledTimes(2);
  expect(t.session.canWrite()).toBe(false);
});
it("does not duplicate renewal during visibility restoration", async () => {
  const t = setup();
  t.server("collab-challenge", { challenge });
  await flush();
  t.request.mockReturnValue(new Promise(() => {}));
  await vi.advanceTimersByTimeAsync(30000);
  t.visibility.dispatchEvent(new Event("visibilitychange"));
  t.visibility.dispatchEvent(new Event("visibilitychange"));
  expect(t.request).toHaveBeenCalledTimes(2);
});
it("closing aborts requests and ignores delayed ticket results", async () => {
  const t = setup();
  let finish!: (grant: RelayGrant) => void;
  t.request.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  t.server("collab-challenge", { challenge });
  t.session.close();
  const signal = t.request.mock.calls[0][2];
  expect(signal.aborted).toBe(true);
  finish({ ticket: "TEST", scope: "write", expiresAt: Date.now() + 60000 });
  await flush();
  expect(t.socket.emit).not.toHaveBeenCalled();
  expect(t.error).not.toHaveBeenCalled();
});
it("disconnect and new challenge invalidate a pending request from the old socket", async () => {
  const t = setup();
  let finish!: (grant: RelayGrant) => void;
  t.request.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  t.server("collab-challenge", { challenge });
  t.socket.connected = false;
  t.server("disconnect", "transport close");
  t.socket.id = "TEST-new-socket";
  t.socket.connected = true;
  t.server("collab-challenge", { challenge: "b".repeat(64) });
  await flush();
  finish({ ticket: "TEST-old", scope: "write", expiresAt: Date.now() + 60000 });
  await flush();
  expect(t.socket.emit).toHaveBeenCalledTimes(1);
  expect(t.session.isReady()).toBe(true);
});
it("late ACK after disconnect cannot activate the new socket", async () => {
  const t = setup();
  t.delayAck();
  t.server("collab-challenge", { challenge });
  await flush();
  t.socket.connected = false;
  t.server("disconnect", "transport close");
  t.acknowledgements[0]({ ok: true });
  await flush();
  expect(t.ready).not.toHaveBeenCalled();
  expect(t.session.isReady()).toBe(false);
});
it("stale external operation closes without notifying a different room", async () => {
  const t = setup();
  let finish!: (grant: RelayGrant) => void;
  t.request.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  t.server("collab-challenge", { challenge });
  t.stale();
  finish({ ticket: "TEST", scope: "write", expiresAt: Date.now() + 60000 });
  await flush();
  expect(t.socket.disconnect).toHaveBeenCalled();
  expect(t.ready).not.toHaveBeenCalled();
  expect(t.error).not.toHaveBeenCalled();
});
it("failed ACK closes and never exposes backend details", async () => {
  const t = setup();
  t.delayAck();
  t.server("collab-challenge", { challenge });
  await flush();
  t.acknowledgements[0]({ ok: false, error: "TEST-sensitive" });
  await flush();
  expect(t.session.isReady()).toBe(false);
  expect(t.socket.disconnect).toHaveBeenCalled();
  expect(t.error).toHaveBeenCalledWith(
    expect.not.stringContaining("TEST-sensitive"),
  );
});
it("bounds ACK and silent server waits", async () => {
  const t = setup();
  t.delayAck();
  t.server("collab-challenge", { challenge });
  await flush();
  await vi.advanceTimersByTimeAsync(10000);
  expect(t.error).toHaveBeenCalledTimes(1);
  const silent = setup();
  await vi.advanceTimersByTimeAsync(60000);
  expect(silent.error).toHaveBeenCalledTimes(1);
});
it("bounds a hanging ticket request and closes on renewal failure", async () => {
  const t = setup();
  t.server("collab-challenge", { challenge });
  await flush();
  t.request.mockReturnValue(new Promise(() => {}));
  await vi.advanceTimersByTimeAsync(50000);
  expect(t.session.isReady()).toBe(false);
  expect(t.socket.disconnect).toHaveBeenCalled();
  expect(t.error).toHaveBeenCalledTimes(1);
});
it("background expiry is checked even before delayed timers run", async () => {
  const t = setup();
  t.server("collab-challenge", { challenge });
  await flush();
  vi.setSystemTime(Date.now() + 61000);
  expect(t.session.canWrite()).toBe(false);
  t.visibility.dispatchEvent(new Event("visibilitychange"));
  expect(t.socket.disconnect).toHaveBeenCalled();
});
it("closes immediately on server expiry or malformed challenge", async () => {
  const t = setup();
  t.server("collab-expired");
  expect(t.error).toHaveBeenCalledTimes(1);
  const bad = setup();
  bad.server("collab-challenge", { challenge: "invalid" });
  expect(bad.request).not.toHaveBeenCalled();
  expect(bad.error).toHaveBeenCalledTimes(1);
});
it("cancels preparation on close and never opens writable state later", async () => {
  const t = setup();
  let complete!: () => void;
  let preparationCurrent!: () => boolean;
  t.ready.mockImplementation((_scope, isCurrent) => {
    preparationCurrent = isCurrent;
    return new Promise((resolve) => {
      complete = resolve;
    });
  });
  t.server("collab-challenge", { challenge });
  await flush();
  t.session.close();
  expect(preparationCurrent()).toBe(false);
  complete();
  await flush();
  expect(t.session.canWrite()).toBe(false);
});
it("bounds waiting for a new challenge after transport loss", async () => {
  const t = setup();
  t.server("collab-challenge", { challenge });
  await flush();
  t.socket.connected = false;
  t.server("disconnect", "transport close");
  await vi.advanceTimersByTimeAsync(60000);
  expect(t.error).toHaveBeenCalledTimes(1);
  expect(t.session.isReady()).toBe(false);
});
