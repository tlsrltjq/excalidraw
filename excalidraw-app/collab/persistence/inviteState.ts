import { atom } from "../../app-jotai";

export const inviteConnectionAtom = atom<string | null>(null);
export const inviteViewModeAtom = atom<boolean | null>(null);
export const isSupabaseCollabEnabled = () =>
  import.meta.env.VITE_COLLAB_SUPABASE_ENABLED === "true";
