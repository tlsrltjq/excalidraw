import { MIME_TYPES } from "@excalidraw/common";
import { decompressData } from "@excalidraw/excalidraw/data/encode";
import { AbortError } from "@excalidraw/excalidraw/errors";

import type { BinaryFileMetadata, DataURL } from "@excalidraw/excalidraw/types";

import type { FileId } from "@excalidraw/element/types";

import {
  FILE_UPLOAD_MAX_BYTES,
  FIREBASE_STORAGE_PREFIXES,
} from "../../app_constants";

import { deriveInviteProof } from "./invites";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { SupabaseInvite } from "./invites";
import type { CollabPersistence } from "./types";

export const createSupabaseFiles = (
  client: SupabaseClient,
  credentials: SupabaseInvite,
  isCurrent: () => boolean,
): Pick<CollabPersistence, "saveFiles" | "loadFiles"> => {
  const invite = { ...credentials };
  const check = () => {
    if (!isCurrent()) {
      throw new AbortError();
    }
  };
  const prefixForRoom = `${FIREBASE_STORAGE_PREFIXES.collabFiles}/${invite.roomId}`;
  const request = async (
    prefix: string,
    id: FileId,
    action: "upload" | "download",
    buffer?: Uint8Array,
  ) => {
    check();
    if (
      (prefix !== prefixForRoom && prefix !== prefixForRoom.slice(1)) ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(id) ||
      (action === "upload" &&
        (!buffer?.byteLength || buffer.byteLength > FILE_UPLOAD_MAX_BYTES))
    ) {
      throw new Error("Invalid collaboration file request");
    }
    let data: string | undefined;
    if (buffer) {
      let binary = "";
      for (const byte of buffer) {
        binary += String.fromCharCode(byte);
      }
      data = btoa(binary);
    }
    const proof = await deriveInviteProof(invite);
    check();
    const result = await client.functions.invoke("collab-files", {
      body: {
        action,
        roomId: invite.roomId,
        inviteId: invite.inviteId,
        proof,
        fileId: id,
        ...(data !== undefined ? { data } : {}),
      },
    });
    check();
    if (result.error) {
      throw new Error("Collaboration file request failed");
    }
    return result.data;
  };
  return {
    async saveFiles({ prefix, files }) {
      const savedFiles: FileId[] = [];
      const erroredFiles: FileId[] = [];
      // Bound per-room upload concurrency, preserving individual retry results.
      for (let start = 0; start < files.length; start += 3) {
        await Promise.all(
          files.slice(start, start + 3).map(async ({ id, buffer }) => {
            try {
              const result = await request(prefix, id, "upload", buffer);
              if (result?.ok !== true) {
                throw new Error("Invalid file response");
              }
              savedFiles.push(id);
            } catch {
              erroredFiles.push(id);
            }
          }),
        );
      }
      check();
      return { savedFiles, erroredFiles };
    },
    async loadFiles(prefix, decryptionKey, fileIds) {
      const loadedFiles: Awaited<
        ReturnType<CollabPersistence["loadFiles"]>
      >["loadedFiles"] = [];
      const erroredFiles = new Map<FileId, true>();
      const ids = [...new Set(fileIds)];
      for (let start = 0; start < ids.length; start += 3) {
        await Promise.all(
          ids.slice(start, start + 3).map(async (id) => {
            try {
              if (decryptionKey !== invite.roomKey) {
                throw new Error("Invalid file key");
              }
              const result: unknown = await request(prefix, id, "download");
              if (
                !(result instanceof Blob) ||
                !result.size ||
                result.size > FILE_UPLOAD_MAX_BYTES
              ) {
                throw new Error("Invalid file response");
              }
              const bytes = new Uint8Array(await result.arrayBuffer());
              check();
              const { data, metadata } =
                await decompressData<BinaryFileMetadata>(bytes, {
                  decryptionKey,
                  maxDecompressedBytes: FILE_UPLOAD_MAX_BYTES + 64 * 1024,
                });
              check();
              if (
                data.byteLength > FILE_UPLOAD_MAX_BYTES ||
                (metadata.id && metadata.id !== id) ||
                (metadata.mimeType && typeof metadata.mimeType !== "string") ||
                (metadata.created &&
                  (typeof metadata.created !== "number" ||
                    !Number.isFinite(metadata.created)))
              ) {
                throw new Error("Invalid file metadata");
              }
              const dataURL = new TextDecoder().decode(data) as DataURL;
              if (!dataURL.startsWith("data:")) {
                throw new Error("Invalid file data");
              }
              loadedFiles.push({
                id,
                dataURL,
                mimeType: metadata.mimeType || MIME_TYPES.binary,
                created: metadata.created || Date.now(),
                lastRetrieved: metadata.created || Date.now(),
              });
            } catch {
              erroredFiles.set(id, true);
            }
          }),
        );
      }
      check();
      return { loadedFiles, erroredFiles };
    },
  };
};
