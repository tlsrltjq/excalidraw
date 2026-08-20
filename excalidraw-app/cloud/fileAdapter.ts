/**
 * Personal Excalidraw Cloud — file adapter (Milestone 5).
 *
 * `createCloudFileManager(drawingId)` returns a `FileManager` (the same
 * base class `LocalData.fileStorage` uses — see
 * `excalidraw-app/data/FileManager.ts`) wired to Supabase Storage +
 * `drawing_files` instead of IndexedDB. Reusing it gives us, for free:
 *   - dedup by file version, so unchanged images aren't re-uploaded on
 *     every autosave (ENGINEERING_GUARDRAILS.md #9 "신규/변경 파일만 업로드")
 *   - `shouldPreventUnload` or `shouldUpdateImageElementStatus` if a caller
 *     wants them, matching the exact pattern `App.tsx` already uses for
 *     `LocalData.fileStorage`
 *
 * One instance is created per currently-open Cloud drawing (see
 * `cloud/autosave.ts`) rather than a single module-level singleton,
 * because `drawingId` is baked into every Storage path and DB row this
 * adapter writes — reusing one instance across a drawing switch would risk
 * writing a newly-added image into the *previous* drawing's folder if a
 * save was still in flight at switch time.
 */
import { dataURLToFile, getDataURL } from "@excalidraw/excalidraw/data/blob";

import type { FileId } from "@excalidraw/element/types";
import type { BinaryFileData } from "@excalidraw/excalidraw/types";

import { FileManager } from "../data/FileManager";
import { FileStatusStore } from "../data/fileStatusStore";

import { supabase } from "./supabaseClient";

const BUCKET = "drawing-files";

const storagePath = (ownerId: string, drawingId: string, fileId: FileId) =>
  `${ownerId}/${drawingId}/${fileId}`;

/**
 * Not `session.ts`'s session atom on purpose — that module imports
 * `cloud/autosave.ts`, which will import this file, and `cloud/autosave.ts`
 * importing `session.ts` back would be a cycle. `getSession()` reads the
 * already-cached local session (no network round trip), which is enough:
 * this id only picks a folder name, not an access decision — RLS on both
 * `drawing_files` and `storage.objects` independently re-checks
 * `auth.uid()` server-side regardless of what the client sends.
 */
const getOwnerId = async (): Promise<string | null> => {
  if (!supabase) {
    return null;
  }
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
};

export const createCloudFileManager = (drawingId: string) =>
  new FileManager({
    onFileStatusChange: FileStatusStore.updateStatuses.bind(FileStatusStore),

    getFiles: async (ids: FileId[]) => {
      const loadedFiles: BinaryFileData[] = [];
      const erroredFiles = new Map<FileId, true>();

      if (!supabase) {
        ids.forEach((id) => erroredFiles.set(id, true));
        return { loadedFiles, erroredFiles };
      }
      const client = supabase;

      await Promise.all(
        ids.map(async (id) => {
          try {
            const { data: meta, error: metaError } = await client
              .from("drawing_files")
              .select("mime_type, storage_path, created_at")
              .eq("drawing_id", drawingId)
              .eq("file_id", id)
              .maybeSingle();

            if (metaError) {
              throw metaError;
            }
            if (!meta) {
              throw new Error(`no drawing_files row for file ${id}`);
            }

            const { data: blob, error: downloadError } = await client.storage
              .from(BUCKET)
              .download(meta.storage_path);

            if (downloadError || !blob) {
              throw downloadError ?? new Error(`empty download for file ${id}`);
            }

            const dataURL = await getDataURL(blob);
            loadedFiles.push({
              id,
              dataURL,
              mimeType: meta.mime_type as BinaryFileData["mimeType"],
              created: new Date(meta.created_at).getTime(),
              lastRetrieved: Date.now(),
            });
          } catch (e) {
            // eslint-disable-next-line no-console
            console.error("[personal-cloud] failed to load file", id, e);
            erroredFiles.set(id, true);
          }
        }),
      );

      return { loadedFiles, erroredFiles };
    },

    saveFiles: async ({ addedFiles }) => {
      const savedFiles = new Map<FileId, BinaryFileData>();
      const erroredFiles = new Map<FileId, BinaryFileData>();

      const ownerId = await getOwnerId();
      if (!supabase || !ownerId) {
        for (const [id, data] of addedFiles) {
          erroredFiles.set(id, data);
        }
        return { savedFiles, erroredFiles };
      }
      const client = supabase;

      await Promise.all(
        [...addedFiles].map(async ([id, fileData]) => {
          try {
            const path = storagePath(ownerId, drawingId, id);
            const file = dataURLToFile(fileData.dataURL, id);

            const { error: uploadError } = await client.storage
              .from(BUCKET)
              .upload(path, file, {
                contentType: fileData.mimeType,
                upsert: true,
              });
            if (uploadError) {
              throw uploadError;
            }

            const { error: metaError } = await client
              .from("drawing_files")
              .upsert(
                {
                  drawing_id: drawingId,
                  file_id: id,
                  mime_type: fileData.mimeType,
                  storage_path: path,
                },
                { onConflict: "drawing_id,file_id" },
              );
            if (metaError) {
              throw metaError;
            }

            savedFiles.set(id, fileData);
          } catch (e) {
            // eslint-disable-next-line no-console
            console.error("[personal-cloud] failed to save file", id, e);
            erroredFiles.set(id, fileData);
          }
        }),
      );

      return { savedFiles, erroredFiles };
    },
  });
