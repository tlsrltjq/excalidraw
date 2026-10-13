import { assertSupabaseRoomId, deriveInviteProof } from "./invites";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { SupabaseInvite } from "./invites";
import type { EncryptedScene, EncryptedSceneStore } from "./sceneWriter";

const MAX_BYTES = 2097152;
const invalid = () => new Error("Invalid collaboration response");
const integer = (value: unknown, minimum: number) =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= minimum;

const toBase64 = (bytes: Uint8Array) => {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
};
const fromBase64 = (value: unknown, min: number, max: number) => {
  if (
    typeof value !== "string" ||
    value.length > Math.ceil(max / 3) * 4 + Math.ceil(max / 57)
  ) {
    throw invalid();
  }
  let binary: string;
  try {
    binary = atob(value);
  } catch {
    throw invalid();
  }
  if (binary.length < min || binary.length > max) {
    throw invalid();
  }
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

export const createSupabaseSceneStore = (
  client: SupabaseClient,
  invite: SupabaseInvite,
): EncryptedSceneStore => {
  // Derive per request so a rejected derivation does not poison retries.
  const rpc = async (name: string, roomId: string, args = {}) => {
    assertSupabaseRoomId(roomId);
    if (roomId !== invite.roomId) {
      throw new Error("Collaboration access denied");
    }
    const proof = await deriveInviteProof(invite);
    const { data, error } = await client
      .rpc(name, {
        p_room_id: roomId,
        p_invite_id: invite.inviteId,
        p_proof: proof,
        ...args,
      })
      .then(
        (result) => result,
        () => {
          throw new Error("Collaboration request failed");
        },
      );
    if (error) {
      // Backend details may contain request parameters; never expose them.
      throw new Error(
        error.code === "42501"
          ? "Collaboration access denied"
          : "Collaboration request failed",
      );
    }
    return data;
  };

  return {
    async read(roomId) {
      const data: unknown = await rpc("collab_read_scene", roomId);
      if (data === null) {
        return null;
      }
      if (!data || typeof data !== "object") {
        throw invalid();
      }
      const scene = data as Record<string, unknown>;
      if (!integer(scene.revision, 1) || !integer(scene.sceneVersion, 0)) {
        throw invalid();
      }
      return {
        ciphertext: fromBase64(scene.ciphertext, 16, MAX_BYTES).buffer,
        iv: fromBase64(scene.iv, 12, 12),
        revision: scene.revision as number,
        sceneVersion: scene.sceneVersion as number,
      };
    },
    async compareAndSwap(roomId, expectedRevision, scene: EncryptedScene) {
      if (
        (expectedRevision !== null &&
          (!integer(expectedRevision, 1) ||
            expectedRevision >= Number.MAX_SAFE_INTEGER)) ||
        !integer(scene.sceneVersion, 0) ||
        scene.iv.byteLength !== 12 ||
        scene.ciphertext.byteLength < 16 ||
        scene.ciphertext.byteLength > MAX_BYTES
      ) {
        throw new Error("Invalid encrypted collaboration scene");
      }
      const data = await rpc("collab_cas_scene", roomId, {
        p_expected_revision: expectedRevision,
        p_ciphertext: toBase64(new Uint8Array(scene.ciphertext)),
        p_iv: toBase64(scene.iv),
        p_scene_version: scene.sceneVersion,
      });
      if (data?.status === "conflict") {
        return { status: "conflict" };
      }
      if (
        data?.status !== "saved" ||
        data.revision !== (expectedRevision ?? 0) + 1
      ) {
        throw invalid();
      }
      return { status: "saved", revision: data.revision };
    },
  };
};
