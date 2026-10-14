import { toBrandedType } from "@excalidraw/common";
import { AbortError } from "@excalidraw/excalidraw/errors";
import { getSceneVersion } from "@excalidraw/element";

import type { RemoteExcalidrawElement } from "@excalidraw/excalidraw/data/reconcile";

import {
  createEncryptedSceneWriter,
  decodeEncryptedCollabScene,
} from "./sceneWriter";
import { createSupabaseSceneStore } from "./supabaseSceneStore";
import { createSupabaseFiles } from "./supabaseFiles";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Socket } from "socket.io-client";
import type { SupabaseInvite } from "./invites";
import type { CollabPersistence } from "./types";

export const createSupabaseCollabPersistence = (options: {
  client: SupabaseClient;
  invite: SupabaseInvite;
  scope: "read" | "write";
  isCurrent(): boolean;
}): CollabPersistence => {
  const invite = { ...options.invite };
  const { client, scope, isCurrent } = options;
  const check = () => {
    if (!isCurrent()) {
      throw new AbortError();
    }
  };
  const matches = (roomId: string | null, roomKey: string | null) =>
    roomId === invite.roomId && roomKey === invite.roomKey;
  const store = createSupabaseSceneStore(client, invite);
  const write = createEncryptedSceneWriter(store);
  const files = createSupabaseFiles(client, invite, isCurrent);
  const savedVersions = new WeakMap<Socket, number>();
  return {
    isSaved(portal, elements) {
      return (
        isCurrent() &&
        !!portal.socket &&
        matches(portal.roomId, portal.roomKey) &&
        savedVersions.get(portal.socket) === getSceneVersion(elements)
      );
    },
    async saveScene(portal, elements, appState) {
      check();
      if (!matches(portal.roomId, portal.roomKey)) {
        throw new Error("Collaboration access denied");
      }
      if (scope !== "write") {
        throw new Error("Read-only collaboration invitation");
      }
      const socket = portal.socket;
      if (!socket) {
        return null;
      }
      if (savedVersions.get(socket) === getSceneVersion(elements)) {
        return null;
      }
      const current = () =>
        isCurrent() &&
        portal.socket === socket &&
        matches(portal.roomId, portal.roomKey);
      const saved = await write({
        roomId: invite.roomId,
        roomKey: invite.roomKey,
        elements,
        appState,
        isCurrent: current,
      });
      if (!current()) {
        throw new AbortError();
      }
      savedVersions.set(socket, getSceneVersion(saved.elements));
      return toBrandedType<RemoteExcalidrawElement[]>(saved.elements);
    },
    async loadScene(roomId, roomKey, socket) {
      check();
      if (!matches(roomId, roomKey)) {
        throw new Error("Collaboration access denied");
      }
      const encrypted = await store.read(roomId);
      check();
      if (!encrypted) {
        if (socket) {
          savedVersions.delete(socket);
        }
        return null;
      }
      const elements = await decodeEncryptedCollabScene(encrypted, roomKey);
      check();
      if (socket) {
        savedVersions.set(socket, getSceneVersion(elements));
      }
      return elements;
    },
    async saveFiles(input) {
      check();
      if (scope !== "write") {
        return {
          savedFiles: [],
          erroredFiles: input.files.map(({ id }) => id),
        };
      }
      return files.saveFiles(input);
    },
    loadFiles: files.loadFiles,
  };
};
