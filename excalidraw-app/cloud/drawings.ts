/**
 * Personal Excalidraw Cloud — drawings repository (Milestone 3).
 *
 * Every function here throws if Cloud isn't configured or if Supabase
 * returns an error — callers (Dashboard UI) are expected to catch and show
 * a status/error state, not to treat these as fire-and-forget.
 *
 * RLS on `public.drawings` is the actual access boundary (see
 * supabase/migrations/20260819130357_create_drawings_table.sql). This
 * module never reads/writes `owner_id` itself — the DB column default
 * (`auth.uid()`) and policies handle that.
 */
import { getDefaultAppState } from "@excalidraw/excalidraw/appState";
import { serializeAsJSON } from "@excalidraw/excalidraw/data/json";

import { supabase } from "./supabaseClient";

import type {
  CloudDrawing,
  CloudDrawingSummary,
  CloudSceneData,
} from "./types";

const TABLE = "drawings";

const requireClient = () => {
  if (!supabase) {
    throw new Error(
      "[personal-cloud] Cloud is not configured (missing VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY).",
    );
  }
  return supabase;
};

/**
 * A valid, empty Excalidraw scene in the exact shape `scene_data` always
 * uses — produced the same way a real save would, not a hand-rolled object
 * (AGENTS.md "Excalidraw 데이터 규칙").
 */
const createEmptyCloudScene = (): CloudSceneData =>
  JSON.parse(serializeAsJSON([], getDefaultAppState(), {}, "database"));

type DrawingRow = {
  id: string;
  owner_id: string;
  title: string;
  scene_data: CloudSceneData;
  revision: number;
  created_at: string;
  updated_at: string;
};

const toCloudDrawing = (row: DrawingRow): CloudDrawing => ({
  id: row.id,
  ownerId: row.owner_id,
  title: row.title,
  sceneData: row.scene_data,
  revision: row.revision,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const listDrawings = async (): Promise<CloudDrawingSummary[]> => {
  const client = requireClient();
  const { data, error } = await client
    .from(TABLE)
    .select("id, title, created_at, updated_at")
    .order("updated_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
};

export const createDrawing = async (
  title: string = "제목 없는 그림",
): Promise<CloudDrawing> => {
  const client = requireClient();
  const { data, error } = await client
    .from(TABLE)
    .insert({ title, scene_data: createEmptyCloudScene() })
    .select("id, owner_id, title, scene_data, revision, created_at, updated_at")
    .single();

  if (error) {
    throw error;
  }

  return toCloudDrawing(data);
};

export const renameDrawing = async (
  id: string,
  title: string,
): Promise<void> => {
  const client = requireClient();
  const { error } = await client.from(TABLE).update({ title }).eq("id", id);

  if (error) {
    throw error;
  }
};

export const deleteDrawing = async (id: string): Promise<void> => {
  const client = requireClient();
  const { error } = await client.from(TABLE).delete().eq("id", id);

  if (error) {
    throw error;
  }
};

/** Fetches the full drawing (including scene_data) for opening in the editor. */
export const getDrawing = async (id: string): Promise<CloudDrawing | null> => {
  const client = requireClient();
  const { data, error } = await client
    .from(TABLE)
    .select("id, owner_id, title, scene_data, revision, created_at, updated_at")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw error;
  }
  if (!data) {
    return null;
  }

  return toCloudDrawing(data);
};
