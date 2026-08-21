/**
 * Personal Excalidraw Cloud — version history repository (Milestone 6,
 * DECISIONS.md D-012).
 *
 * `drawing_revisions` is populated entirely by a DB trigger (see
 * supabase/migrations/20260821125802_create_drawing_revisions.sql) — this
 * module only reads it and performs restores. There's no "insert a
 * revision" function here on purpose: the client has no INSERT grant on
 * that table at all.
 */
import { getDrawing, updateDrawingScene } from "./drawings";
import { supabase } from "./supabaseClient";

import type { CloudSceneData } from "./types";

const TABLE = "drawing_revisions";

const requireClient = () => {
  if (!supabase) {
    throw new Error(
      "[personal-cloud] Cloud is not configured (missing VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY).",
    );
  }
  return supabase;
};

export type RevisionSummary = {
  id: string;
  revision: number;
  createdAt: string;
};

export const listRevisions = async (
  drawingId: string,
): Promise<RevisionSummary[]> => {
  const client = requireClient();
  const { data, error } = await client
    .from(TABLE)
    .select("id, revision, created_at")
    .eq("drawing_id", drawingId)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    revision: row.revision,
    createdAt: row.created_at,
  }));
};

const getRevisionScene = async (id: string): Promise<CloudSceneData> => {
  const client = requireClient();
  const { data, error } = await client
    .from(TABLE)
    .select("scene_data")
    .eq("id", id)
    .single();

  if (error) {
    throw error;
  }

  return data.scene_data as CloudSceneData;
};

export type RestoreRevisionResult =
  | { status: "ok"; sceneData: CloudSceneData }
  | { status: "conflict" };

/**
 * Restores a past revision by writing its scene_data as a normal
 * conditional update against the drawing's *current* revision — there's
 * no special server-side "restore" path, so this goes through the exact
 * same optimistic-concurrency check as autosave (ENGINEERING_GUARDRAILS.md
 * #7) and gets its own new entry in drawing_revisions from the trigger
 * (restoring is itself undoable).
 */
export const restoreRevision = async (
  drawingId: string,
  revisionId: string,
): Promise<RestoreRevisionResult> => {
  const [sceneData, current] = await Promise.all([
    getRevisionScene(revisionId),
    getDrawing(drawingId),
  ]);

  if (!current) {
    throw new Error("이 그림은 더 이상 존재하지 않습니다.");
  }

  const result = await updateDrawingScene(
    drawingId,
    sceneData,
    current.revision,
  );
  if (result.status === "conflict") {
    return { status: "conflict" };
  }

  return { status: "ok", sceneData };
};
