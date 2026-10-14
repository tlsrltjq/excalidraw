import type { Socket } from "socket.io-client";
import type { RelayGrant } from "./relayTicketRequest";

type Options = {
  socket: Socket;
  roomId: string;
  isCurrent(): boolean;
  requestTicket(
    challenge: string,
    isCurrent: () => boolean,
    signal: AbortSignal,
  ): Promise<RelayGrant>;
  onPending(): void;
  onReady(
    scope: "read" | "write",
    isCurrent: () => boolean,
  ): Promise<void> | void;
  onError(message: string): void;
  visibility?: Pick<
    Document,
    "hidden" | "addEventListener" | "removeEventListener"
  >;
};

// Attach before socket.connect(). This worker owns only admission, not scenes.
export const createRelaySession = (options: Options) => {
  const { socket } = options;
  const visibility = options.visibility ?? document;
  let disposed = false;
  let generation = 0;
  let challenge: string | null = null;
  let socketId: string | undefined;
  let grant: RelayGrant | null = null;
  let expiresAt = 0;
  let busy = false;
  let abort: AbortController | null = null;
  let renewal: ReturnType<typeof setTimeout> | undefined;
  let expiry: ReturnType<typeof setTimeout> | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  const acknowledgements = new Set<() => void>();
  const current = () => !disposed && options.isCurrent();
  const isReady = () =>
    current() &&
    socket.connected &&
    socket.id === socketId &&
    !!grant &&
    Date.now() < grant.expiresAt;
  const invalidate = () => {
    generation++;
    grant = null;
    expiresAt = 0;
    busy = false;
    abort?.abort();
    abort = null;
    clearTimeout(renewal);
    clearTimeout(expiry);
    clearTimeout(deadline);
    for (const cancel of acknowledgements) {
      cancel();
    }
  };
  const close = () => {
    if (disposed) {
      return;
    }
    disposed = true;
    invalidate();
    socket.off("collab-challenge", onChallenge);
    socket.off("disconnect", onDisconnect);
    socket.off("collab-expired", onExpired);
    socket.off("connect_error", onConnectionError);
    visibility.removeEventListener("visibilitychange", onVisibility);
    socket.disconnect();
  };
  const fail = (message: string) => {
    const notify = current();
    close();
    if (notify) {
      options.onPending();
      options.onError(message);
    }
  };
  const ack = (name: string, args: unknown[]) =>
    new Promise<void>((resolve, reject) => {
      const cancel = () => {
        clearTimeout(timer);
        acknowledgements.delete(cancel);
        reject(
          new DOMException("Operation is no longer current", "AbortError"),
        );
      };
      const timer = setTimeout(() => {
        acknowledgements.delete(cancel);
        reject(new Error("Admission acknowledgement timeout"));
      }, 10000);
      acknowledgements.add(cancel);
      socket.emit(name, ...args, (response: unknown) => {
        if (!acknowledgements.delete(cancel)) {
          return;
        }
        clearTimeout(timer);
        if (
          !response ||
          typeof response !== "object" ||
          Array.isArray(response) ||
          Object.keys(response).length !== 1 ||
          (response as { ok?: unknown }).ok !== true
        ) {
          reject(new Error("Admission rejected"));
        } else {
          resolve();
        }
      });
    });
  const authorize = async (renew: boolean) => {
    if (!current()) {
      close();
      return;
    }
    if (busy || !challenge || !socket.connected) {
      return;
    }
    busy = true;
    const operation = generation;
    const id = socket.id;
    const activeChallenge = challenge;
    const operationCurrent = () =>
      current() &&
      generation === operation &&
      socket.connected &&
      socket.id === id &&
      challenge === activeChallenge;
    const checkOperation = () => {
      if (!current()) {
        close();
      }
      return operationCurrent();
    };
    const controller = new AbortController();
    abort = controller;
    deadline = setTimeout(() => {
      if (operationCurrent()) {
        fail("협업 연결을 확인하지 못했습니다. 다시 참여하세요.");
      }
    }, 20000);
    try {
      const next = await options.requestTicket(
        activeChallenge,
        operationCurrent,
        controller.signal,
      );
      if (!checkOperation()) {
        return;
      }
      if (
        next.expiresAt <= Date.now() ||
        (renew && next.expiresAt <= expiresAt)
      ) {
        throw new Error("Expired or replayed grant");
      }
      await ack(
        renew ? "renew-collab-ticket" : "join-collab-room",
        renew
          ? [next.ticket]
          : [{ roomId: options.roomId, ticket: next.ticket }],
      );
      if (!checkOperation()) {
        return;
      }
      grant = null;
      expiresAt = next.expiresAt;
      clearTimeout(expiry);
      expiry = setTimeout(onExpired, Math.max(0, expiresAt - Date.now()));
      await options.onReady(next.scope, operationCurrent);
      if (!checkOperation()) {
        return;
      }
      if (Date.now() >= expiresAt) {
        throw new Error("Grant expired during preparation");
      }
      grant = next;
      clearTimeout(renewal);
      renewal = setTimeout(() => {
        void authorize(true);
      }, Math.max(0, expiresAt - Date.now() - 30000));
    } catch {
      if (operationCurrent()) {
        fail("협업 권한을 확인하지 못했습니다. 다시 참여하세요.");
      } else if (!options.isCurrent()) {
        close();
      }
    } finally {
      if (generation === operation) {
        busy = false;
        clearTimeout(deadline);
        abort = null;
      }
    }
  };
  const onChallenge = (input: unknown) => {
    if (!current()) {
      close();
      return;
    }
    if (
      !input ||
      typeof input !== "object" ||
      Array.isArray(input) ||
      Object.keys(input).length !== 1 ||
      typeof (input as { challenge?: unknown }).challenge !== "string" ||
      !/^[a-f0-9]{64}$/.test((input as { challenge: string }).challenge)
    ) {
      fail("협업 서버의 입장 정보를 확인하지 못했습니다.");
      return;
    }
    const next = (input as { challenge: string }).challenge;
    if (next === challenge && socket.id === socketId) {
      return;
    }
    invalidate();
    challenge = next;
    socketId = socket.id;
    options.onPending();
    void authorize(false);
  };
  const onDisconnect = (reason: string) => {
    invalidate();
    challenge = null;
    socketId = undefined;
    if (!current()) {
      close();
      return;
    }
    options.onPending();
    if (reason === "io server disconnect") {
      fail("협업 연결이 종료되었습니다. 다시 참여하세요.");
    } else {
      deadline = setTimeout(
        () => fail("협업 서버에 다시 연결하지 못했습니다. 다시 참여하세요."),
        60000,
      );
    }
  };
  const onExpired = () =>
    fail("협업 입장권이 만료되었습니다. 다시 참여하세요.");
  const onConnectionError = () =>
    fail("협업 서버에 연결하지 못했습니다. 다시 참여하세요.");
  const onVisibility = () => {
    if (visibility.hidden) {
      return;
    }
    if (!current()) {
      close();
      return;
    }
    if (expiresAt && Date.now() >= expiresAt) {
      onExpired();
    } else if (isReady() && expiresAt - Date.now() <= 30000) {
      void authorize(true);
    }
  };
  socket.on("collab-challenge", onChallenge);
  socket.on("disconnect", onDisconnect);
  socket.on("collab-expired", onExpired);
  socket.on("connect_error", onConnectionError);
  visibility.addEventListener("visibilitychange", onVisibility);
  deadline = setTimeout(
    () => fail("협업 서버의 응답을 기다리지 못했습니다. 다시 참여하세요."),
    60000,
  );
  return {
    close,
    isReady,
    canWrite: () => isReady() && grant?.scope === "write",
  };
};
