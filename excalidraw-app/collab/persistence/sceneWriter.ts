import { reconcileElements } from "@excalidraw/excalidraw";
import {
  encryptData,
  decryptData,
} from "@excalidraw/excalidraw/data/encryption";
import { restoreElements } from "@excalidraw/excalidraw/data/restore";
import { AbortError } from "@excalidraw/excalidraw/errors";
import { getSceneVersion } from "@excalidraw/element";
import { toBrandedType } from "@excalidraw/common";

import type { RemoteExcalidrawElement } from "@excalidraw/excalidraw/data/reconcile";
import type { AppState } from "@excalidraw/excalidraw/types";

import { getSyncableElements } from "../../data";

import { assertSupabaseRoomId } from "./invites";

import type { SyncableExcalidrawElement } from "../../data";

export type EncryptedScene = {
  ciphertext: ArrayBuffer;
  iv: Uint8Array<ArrayBuffer>;
  sceneVersion: number;
};

export interface EncryptedSceneStore {
  read(roomId: string): Promise<(EncryptedScene & { revision: number }) | null>;
  compareAndSwap(
    roomId: string,
    expectedRevision: number | null,
    scene: EncryptedScene,
  ): Promise<{ status: "saved"; revision: number } | { status: "conflict" }>;
}

export class CollabSceneConflictError extends Error {
  constructor() {
    super("Collaboration scene changed during save");
    this.name = "CollabSceneConflictError";
  }
}

type SceneSave = {
  roomId: string;
  roomKey: string;
  elements: readonly SyncableExcalidrawElement[];
  appState: AppState;
  isCurrent(): boolean;
};

export const decodeEncryptedCollabScene = async (
  scene: EncryptedScene,
  roomKey: string,
) => {
  if (
    scene.iv.byteLength !== 12 ||
    scene.ciphertext.byteLength < 16 ||
    !Number.isSafeInteger(scene.sceneVersion) ||
    scene.sceneVersion < 0
  ) {
    throw new Error("Invalid encrypted collaboration scene");
  }
  const plain = await decryptData(scene.iv, scene.ciphertext, roomKey);
  let imported: unknown;
  try {
    imported = JSON.parse(new TextDecoder().decode(plain));
  } catch {
    throw new Error("Invalid encrypted collaboration scene");
  }
  if (!Array.isArray(imported)) {
    throw new Error("Invalid encrypted collaboration scene");
  }
  return getSyncableElements(restoreElements(imported, null));
};

export const createEncryptedSceneWriter = (store: EncryptedSceneStore) => {
  const pending = new Map<string, Promise<unknown>>();

  const run = async (input: SceneSave) => {
    const check = () => {
      if (!input.isCurrent()) {
        throw new AbortError();
      }
    };
    assertSupabaseRoomId(input.roomId);
    for (let attempt = 0; attempt < 3; attempt++) {
      check();
      const previous = await store.read(input.roomId);
      check();
      if (
        previous &&
        (!Number.isSafeInteger(previous.revision) ||
          previous.revision < 0 ||
          previous.revision >= Number.MAX_SAFE_INTEGER)
      ) {
        throw new Error("Invalid collaboration revision");
      }
      const remote = previous
        ? await decodeEncryptedCollabScene(previous, input.roomKey)
        : [];
      check();
      const reconciled = getSyncableElements(
        reconcileElements(
          input.elements,
          toBrandedType<RemoteExcalidrawElement[]>(remote),
          input.appState,
        ),
      );
      const { encryptedBuffer, iv } = await encryptData(
        input.roomKey,
        JSON.stringify(reconciled),
      );
      check();
      const scene = {
        ciphertext: encryptedBuffer,
        iv,
        sceneVersion: getSceneVersion(reconciled),
      };
      const result = await store.compareAndSwap(
        input.roomId,
        previous?.revision ?? null,
        scene,
      );
      check();
      if (result.status === "saved") {
        if (result.revision !== (previous?.revision ?? 0) + 1) {
          throw new Error("Invalid collaboration revision");
        }
        const elements = await decodeEncryptedCollabScene(scene, input.roomKey);
        check();
        return { elements, revision: result.revision };
      }
    }
    throw new CollabSceneConflictError();
  };

  return (input: SceneSave) => {
    // A rejected write must not poison later saves; different rooms stay independent.
    const predecessor = pending.get(input.roomId) ?? Promise.resolve();
    const operation = predecessor.catch(() => {}).then(() => run(input));
    pending.set(input.roomId, operation);
    const cleanup = () => {
      if (pending.get(input.roomId) === operation) {
        pending.delete(input.roomId);
      }
    };
    operation.then(cleanup, cleanup);
    return operation;
  };
};
