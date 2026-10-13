import type { RemoteExcalidrawElement } from "@excalidraw/excalidraw/data/reconcile";
import type { ExcalidrawElement, FileId } from "@excalidraw/element/types";
import type { AppState, BinaryFileData } from "@excalidraw/excalidraw/types";

import type { Socket } from "socket.io-client";

import type { SyncableExcalidrawElement } from "../../data";
import type Portal from "../Portal";

export interface CollabPersistence {
  isSaved(portal: Portal, elements: readonly ExcalidrawElement[]): boolean;
  saveScene(
    portal: Portal,
    elements: readonly SyncableExcalidrawElement[],
    appState: AppState,
  ): Promise<RemoteExcalidrawElement[] | null>;
  loadScene(
    roomId: string,
    roomKey: string,
    socket: Socket | null,
  ): Promise<readonly SyncableExcalidrawElement[] | null>;
  // FileManager supplies the existing compressed, encrypted file buffers.
  saveFiles(input: {
    prefix: string;
    files: { id: FileId; buffer: Uint8Array }[];
  }): Promise<{ savedFiles: FileId[]; erroredFiles: FileId[] }>;
  loadFiles(
    prefix: string,
    decryptionKey: string,
    fileIds: readonly FileId[],
  ): Promise<{
    loadedFiles: BinaryFileData[];
    erroredFiles: Map<FileId, true>;
  }>;
}
