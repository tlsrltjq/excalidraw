export const createProjectQuota = (
  url: string,
  adminKey: string,
  fetcher: typeof fetch = fetch,
) => {
  const rpc = async (name: string, body: object): Promise<boolean> => {
    const response = await fetcher(`${url}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: {
        apikey: adminKey,
        authorization: `Bearer ${adminKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
      redirect: "error",
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error("Project quota unavailable");
    }
    const value: unknown = await response.json();
    if (typeof value !== "boolean") {
      throw new Error("Invalid quota response");
    }
    return value;
  };
  return {
    consume(kind: "files" | "tickets") {
      return rpc("collab_consume_edge_budget", { p_kind: kind });
    },
    reserve(input: {
      roomId: string;
      inviteId: string;
      proof: string;
      fileId: string;
    }) {
      return rpc("collab_reserve_file", {
        p_room_id: input.roomId,
        p_invite_id: input.inviteId,
        p_proof: input.proof,
        p_file_id: input.fileId,
      });
    },
  };
};
