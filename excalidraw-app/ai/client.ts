import { parseDiagram, parseLabelEdit, parseLabelTargets } from "./schema";

import type { LabelTarget } from "./schema";

const endpoint = "http://127.0.0.1:3004";
export type AISession = { token: string; models: string[] };
export const connectLocalAI = async (
  signal: AbortSignal,
): Promise<AISession> => {
  const response = await fetch(`${endpoint}/session`, {
    signal,
    cache: "no-store",
    credentials: "omit",
    redirect: "error",
  });
  if (!response.ok) {
    throw new Error("로컬 모델에 연결할 수 없습니다.");
  }
  const data = await response.json();
  if (
    !/^[A-Za-z0-9_-]{43}$/.test(data.token) ||
    !Array.isArray(data.models) ||
    data.models.length > 50 ||
    data.models.some(
      (name: unknown) => typeof name !== "string" || name.length > 128,
    )
  ) {
    throw new Error("모델 목록을 확인하지 못했습니다.");
  }
  return data;
};
export const generateLocalDiagram = async (
  session: AISession,
  model: string,
  prompt: string,
  signal: AbortSignal,
) => {
  const response = await fetch(`${endpoint}/generate`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-personal-ai-token": session.token,
    },
    body: JSON.stringify({ model, prompt }),
    signal,
    credentials: "omit",
    redirect: "error",
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(
      response.status === 429
        ? "잠시 후 다시 생성해주세요."
        : response.status === 403
        ? "다시 연결해주세요."
        : "생성하지 못했습니다. 요청을 바꿔 다시 시도해주세요.",
    );
  }
  return parseDiagram((await response.json()).diagram);
};

export const editLocalLabels = async (
  session: AISession,
  model: string,
  prompt: string,
  targets: LabelTarget[],
  signal: AbortSignal,
) => {
  const selection = parseLabelTargets(targets);
  const response = await fetch(`${endpoint}/edit-labels`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-personal-ai-token": session.token,
    },
    body: JSON.stringify({ model, prompt, targets: selection }),
    signal,
    credentials: "omit",
    redirect: "error",
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(
      response.status === 403
        ? "다시 연결해주세요."
        : "문구를 수정하지 못했습니다. 잠시 후 다시 시도해주세요.",
    );
  }
  return parseLabelEdit((await response.json()).edit, selection);
};
