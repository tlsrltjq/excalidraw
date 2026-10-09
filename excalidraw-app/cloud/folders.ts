import { supabase } from "./supabaseClient";

export type CloudFolder = { id: string; name: string };
export type FolderWorkspace = {
  folders: CloudFolder[];
  assignments: Record<string, string>;
};

const client = () => {
  if (!supabase) {
    throw new Error("Cloud 연결을 사용할 수 없습니다.");
  }
  return supabase;
};

const folderName = (value: string) => {
  const name = value.trim();
  if (!name || Array.from(name).length > 100) {
    throw new Error("폴더 이름은 1~100자로 입력하세요.");
  }
  return name;
};

export const loadFolderWorkspace = async (): Promise<FolderWorkspace> => {
  const c = client();
  const [folders, assignments] = await Promise.all([
    c.from("folders").select("id, name").order("name"),
    c.from("drawing_folders").select("drawing_id, folder_id"),
  ]);
  if (folders.error || assignments.error) {
    throw new Error(
      "폴더를 불러오지 못했습니다. 연결 및 폴더 DB 설정을 확인하세요.",
    );
  }
  return {
    folders: folders.data ?? [],
    assignments: Object.fromEntries(
      (assignments.data ?? []).map((row) => [row.drawing_id, row.folder_id]),
    ),
  };
};

export const createFolder = async (name: string) => {
  const { data, error } = await client()
    .from("folders")
    .insert({ name: folderName(name) })
    .select("id, name")
    .single();
  if (error) {
    throw error;
  }
  return data as CloudFolder;
};

export const renameFolder = async (id: string, name: string) => {
  const { data, error } = await client()
    .from("folders")
    .update({ name: folderName(name) })
    .eq("id", id)
    .select("id")
    .single();
  if (error || !data) {
    throw error ?? new Error("폴더를 찾을 수 없습니다.");
  }
};

export const deleteFolder = async (id: string) => {
  const { data, error } = await client()
    .from("folders")
    .delete()
    .eq("id", id)
    .select("id")
    .single();
  if (error || !data) {
    throw error ?? new Error("폴더를 찾을 수 없습니다.");
  }
};

export const moveDrawingToFolder = async (
  drawingId: string,
  folderId: string | null,
) => {
  const c = client();
  if (folderId === null) {
    const { error } = await c
      .from("drawing_folders")
      .delete()
      .eq("drawing_id", drawingId);
    if (error) {
      throw error;
    }
    return;
  }
  const { error } = await c
    .from("drawing_folders")
    .upsert(
      { drawing_id: drawingId, folder_id: folderId },
      { onConflict: "drawing_id" },
    );
  if (error) {
    throw error;
  }
};
