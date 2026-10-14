import { toBrandedType } from "@excalidraw/common";

import { WS_SUBTYPES } from "../app_constants";

import Portal from "./Portal";

import type { Socket } from "socket.io-client";
import type { TCollabClass } from "./Collab";
import type { SocketUpdateData } from "../data";

const encryption = vi.hoisted(() => vi.fn());
vi.mock("@excalidraw/excalidraw/data/encryption", () => ({
  encryptData: encryption,
}));
afterEach(() => encryption.mockReset());
const setup = () => {
  let generation = 0;
  const collab = {
    canWrite: () => true,
    captureRoomOperation: () => {
      const captured = generation;
      return () => captured === generation;
    },
  } as unknown as TCollabClass;
  const portal = new Portal(collab);
  const emit = vi.fn();
  portal.socket = { emit } as unknown as Socket;
  portal.socketInitialized = true;
  portal.roomId = "TEST-room";
  portal.roomKey = "TEST-key";
  return { portal, emit, invalidate: () => generation++ };
};
const message = () =>
  toBrandedType<SocketUpdateData>({
    type: WS_SUBTYPES.UPDATE,
    payload: { elements: [] },
  });
it("emits encrypted messages while the room operation remains current", async () => {
  const { portal, emit } = setup();
  encryption.mockResolvedValue({
    encryptedBuffer: new ArrayBuffer(16),
    iv: new Uint8Array(12),
  });
  await portal._broadcastSocketData(message());
  expect(emit).toHaveBeenCalledTimes(1);
});
it("does not send old encrypted bytes through a new room's socket", async () => {
  const { portal, emit, invalidate } = setup();
  let finish!: (result: {
    encryptedBuffer: ArrayBuffer;
    iv: Uint8Array;
  }) => void;
  encryption.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const operation = portal._broadcastSocketData(message());
  invalidate();
  const nextEmit = vi.fn();
  portal.socket = { emit: nextEmit } as unknown as Socket;
  portal.roomId = "TEST-next-room";
  finish({ encryptedBuffer: new ArrayBuffer(16), iv: new Uint8Array(12) });
  await operation;
  expect(emit).not.toHaveBeenCalled();
  expect(nextEmit).not.toHaveBeenCalled();
});
