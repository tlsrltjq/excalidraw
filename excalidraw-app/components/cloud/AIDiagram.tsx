import { Dialog } from "@excalidraw/excalidraw/components/Dialog";
import {
  downloadIcon,
  MagicIcon,
} from "@excalidraw/excalidraw/components/icons";
import { useEffect, useRef, useState } from "react";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { atom, appJotaiStore, useAtom } from "../../app-jotai";
import { cloudSessionAtom } from "../../cloud/session";
import { currentDrawingAtom } from "../../cloud/currentDrawing";
import { isCollaboratingAtom } from "../../collab/Collab";
import {
  appendAIDiagram,
  captureCanvas,
  createDiagramPreview,
  loadAIBackup,
  saveAIBackup,
} from "../../ai/editor";
import {
  connectLocalAI,
  generateLocalDiagram,
  editLocalLabels,
  extendLocalDiagram,
} from "../../ai/client";
import {
  applyLabelPreview,
  createLabelPreview,
  selectedLabelTargets,
} from "../../ai/labelEditor";
import {
  applyStructurePreview,
  createStructurePreview,
  selectedStructureAnchor,
} from "../../ai/structureEditor";

import "./AIDiagram.scss";

import type { CanvasSnapshot } from "../../ai/editor";
import type { AISession } from "../../ai/client";
import type { LabelPreview } from "../../ai/labelEditor";
import type { StructurePreview } from "../../ai/structureEditor";

export const aiDiagramOpenAtom = atom(false);
const identity = () =>
  JSON.stringify([
    appJotaiStore.get(currentDrawingAtom),
    appJotaiStore.get(cloudSessionAtom).session?.user.id ?? null,
    window.location.href,
    appJotaiStore.get(isCollaboratingAtom),
  ]);
const backupKey = () =>
  JSON.stringify([
    appJotaiStore.get(cloudSessionAtom).session?.user.id ?? "local",
    appJotaiStore.get(currentDrawingAtom).drawingId ?? "local",
  ]);
const allowed = (api: ExcalidrawImperativeAPI) =>
  !appJotaiStore.get(isCollaboratingAtom) &&
  !api.getAppState().viewModeEnabled &&
  !window.location.hash.startsWith("#room=") &&
  !new URLSearchParams(window.location.search).has("collabStorage");
type Preview = (
  | (Awaited<ReturnType<typeof createDiagramPreview>> & { kind: "create" })
  | (LabelPreview & { kind: "labels" })
  | (StructurePreview & { kind: "extend" })
) & {
  baseline: CanvasSnapshot;
  identity: string;
  title: string;
};

export const AIDiagram = ({
  excalidrawAPI,
}: {
  excalidrawAPI: ExcalidrawImperativeAPI | null;
}) => {
  const [open, setOpen] = useAtom(aiDiagramOpenAtom);
  return open && excalidrawAPI ? (
    <Dialog
      title="AI 다이어그램"
      size="regular"
      onCloseRequest={() => setOpen(false)}
    >
      <AIDiagramBody api={excalidrawAPI} />
    </Dialog>
  ) : null;
};

const AIDiagramBody = ({ api }: { api: ExcalidrawImperativeAPI }) => {
  const [, setOpen] = useAtom(aiDiagramOpenAtom);
  const [session, setSession] = useState<AISession | null>(null);
  const [model, setModel] = useState("");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewURL, setPreviewURL] = useState("");
  const [backupExists, setBackupExists] = useState(false);
  const [mode, setMode] = useState<"create" | "labels" | "extend">("create");
  const [anchor] = useState(() => {
    try {
      return selectedStructureAnchor(api);
    } catch {
      return null;
    }
  });
  const [selection] = useState(() => {
    try {
      return selectedLabelTargets(api);
    } catch {
      return [];
    }
  });
  const controller = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const working = useRef(false);
  const mounted = useRef(true);
  const original = useRef(identity());
  const current = () =>
    mounted.current && original.current === identity() && allowed(api);
  const invalidate = () => {
    generation.current++;
    controller.current?.abort();
    working.current = false;
  };

  const connect = async () => {
    if (working.current) {
      return;
    }
    working.current = true;
    const operation = ++generation.current;
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setConnecting(true);
    setError("");
    try {
      const result = await connectLocalAI(request.signal);
      if (!mounted.current || operation !== generation.current) {
        return;
      }
      setSession(result);
      setModel(result.models[0] ?? "");
      if (!result.models.length) {
        setError("사용 가능한 로컬 생성 모델이 없습니다.");
      }
    } catch {
      if (
        mounted.current &&
        operation === generation.current &&
        !request.signal.aborted
      ) {
        setError("로컬 모델에 연결할 수 없습니다.");
      }
    } finally {
      if (mounted.current && operation === generation.current) {
        working.current = false;
        setConnecting(false);
      }
    }
  };

  useEffect(() => {
    mounted.current = true;
    const initial = ++generation.current;
    queueMicrotask(() => {
      if (mounted.current && initial === generation.current) {
        void connect();
      }
    });
    const changed = () => {
      if (original.current !== identity()) {
        invalidate();
        setPreview(null);
        setBusy(false);
        setError("문서나 계정이 변경됐습니다. 다시 열어주세요.");
      }
    };
    const stops = [
      appJotaiStore.sub(currentDrawingAtom, changed),
      appJotaiStore.sub(cloudSessionAtom, changed),
      appJotaiStore.sub(isCollaboratingAtom, changed),
    ];
    window.addEventListener("hashchange", changed);
    window.addEventListener("popstate", changed);
    loadAIBackup(backupKey())
      .then((value) => {
        if (mounted.current) {
          setBackupExists(!!value);
        }
      })
      .catch(() => {});
    return () => {
      mounted.current = false;
      invalidate();
      stops.forEach((stop) => stop());
      window.removeEventListener("hashchange", changed);
      window.removeEventListener("popstate", changed);
    };
    // One dialog instance owns the captured document/account identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!preview || preview.kind === "labels") {
      setPreviewURL("");
      return;
    }
    const url = URL.createObjectURL(preview.image);
    setPreviewURL(url);
    return () => URL.revokeObjectURL(url);
  }, [preview]);

  const generate = async () => {
    if (!session || !model || !prompt.trim() || working.current || !current()) {
      return;
    }
    working.current = true;
    const operation = ++generation.current;
    const request = new AbortController();
    controller.current = request;
    setBusy(true);
    setError("");
    setPreview(null);
    try {
      const baseline = captureCanvas(api);
      let result: Preview;
      if (mode === "extend") {
        if (!anchor) {
          throw new Error("기준 도형 한 개를 선택해주세요.");
        }
        const plan = await extendLocalDiagram(
          session,
          model,
          prompt,
          anchor.context,
          request.signal,
        );
        if (!current() || operation !== generation.current) {
          return;
        }
        const output = await createStructurePreview(api, plan, anchor);
        result = { ...output, kind: "extend", baseline, identity: identity() };
      } else if (mode === "labels") {
        const edit = await editLocalLabels(
          session,
          model,
          prompt,
          selection.map(({ id, text }) => ({ id, text })),
          request.signal,
        );
        if (!current() || operation !== generation.current) {
          return;
        }
        const output = await createLabelPreview(api, edit, selection);
        result = {
          ...output,
          kind: "labels",
          baseline,
          identity: identity(),
          title: "문구 수정",
        };
      } else {
        const plan = await generateLocalDiagram(
          session,
          model,
          prompt,
          request.signal,
        );
        if (!current() || operation !== generation.current) {
          return;
        }
        const output = await createDiagramPreview(plan);
        result = {
          ...output,
          kind: "create",
          baseline,
          identity: identity(),
          title: plan.title,
        };
      }
      if (current() && operation === generation.current) {
        setPreview(result);
      }
    } catch (e) {
      if (
        mounted.current &&
        operation === generation.current &&
        !request.signal.aborted
      ) {
        setError(
          e instanceof Error && e.message.includes("해주세요")
            ? e.message
            : "미리보기를 만들지 못했습니다. 다시 생성해주세요.",
        );
      }
    } finally {
      if (mounted.current && operation === generation.current) {
        working.current = false;
        setBusy(false);
      }
    }
  };
  const apply = async () => {
    if (!preview || working.current) {
      return;
    }
    working.current = true;
    setBusy(true);
    setError("");
    const operation = generation.current;
    try {
      const stillCurrent = () =>
        current() &&
        preview.identity === identity() &&
        operation === generation.current;
      const backup = async () => {
        await saveAIBackup(backupKey(), preview.baseline);
        if (current()) {
          setBackupExists(true);
        }
      };
      if (preview.kind === "extend") {
        await applyStructurePreview(
          api,
          preview,
          preview.baseline,
          stillCurrent,
          backup,
        );
      } else if (preview.kind === "labels") {
        await applyLabelPreview(
          api,
          preview,
          preview.baseline,
          stillCurrent,
          backup,
        );
      } else {
        await appendAIDiagram(
          api,
          preview.elements,
          preview.baseline,
          stillCurrent,
          backup,
        );
      }
      setOpen(false);
    } catch {
      if (mounted.current && operation === generation.current) {
        setError(
          "적용하지 못했습니다. 문서 변경 또는 로컬 백업 공간을 확인해주세요.",
        );
      }
    } finally {
      if (mounted.current && operation === generation.current) {
        working.current = false;
        setBusy(false);
      }
    }
  };
  const download = async () => {
    const key = backupKey();
    try {
      const json = await loadAIBackup(key);
      if (!json || !current() || key !== backupKey()) {
        return;
      }
      const url = URL.createObjectURL(
        new Blob([json], { type: "application/json" }),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "before-ai.excalidraw";
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError("백업을 불러오지 못했습니다.");
    }
  };

  return (
    <div className="personal-ai-diagram">
      <div
        className="personal-ai-diagram__modes"
        role="tablist"
        aria-label="AI 작업"
      >
        {(
          [
            ["create", "새 다이어그램"],
            ["labels", "선택 문구 수정"],
            ["extend", "단계·연결 추가"],
          ] as const
        ).map(([value, title]) => (
          <button
            type="button"
            role="tab"
            key={value}
            aria-selected={mode === value}
            disabled={busy || connecting}
            onClick={() => {
              setMode(value);
              setPreview(null);
              setError("");
            }}
          >
            {title}
          </button>
        ))}
      </div>
      <div className="personal-ai-diagram__connection">
        <label>
          로컬 모델
          <select
            aria-label="로컬 모델"
            value={model}
            disabled={busy || connecting}
            onChange={(event) => {
              setModel(event.target.value);
              setPreview(null);
            }}
          >
            {!model && (
              <option value="">{connecting ? "연결 중" : "미연결"}</option>
            )}
            {session?.models.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
        <button type="button" disabled={busy || connecting} onClick={connect}>
          {session ? "다시 연결" : "연결"}
        </button>
      </div>
      {mode === "labels" && (
        <div className="personal-ai-diagram__targets">
          <strong>선택 문구 ({selection.length})</strong>
          {selection.length ? (
            <ul>
              {selection.map((target) => (
                <li key={target.id}>{target.text}</li>
              ))}
            </ul>
          ) : (
            <p role="status">수정 가능한 선택 문구가 없습니다.</p>
          )}
        </div>
      )}
      {mode === "extend" && (
        <div className="personal-ai-diagram__targets">
          <strong>기준 도형</strong>
          {anchor ? (
            <p>{anchor.context.label || anchor.context.kind}</p>
          ) : (
            <p role="status">기준 도형 한 개가 선택되지 않았습니다.</p>
          )}
        </div>
      )}
      <label className="personal-ai-diagram__prompt">
        요청
        <textarea
          rows={4}
          maxLength={2000}
          value={prompt}
          placeholder={
            mode === "extend"
              ? "선택한 단계 뒤에 재시도 단계와 연결을 추가해줘"
              : mode === "labels"
              ? "선택한 문구를 짧은 한국어로 다듬어줘"
              : "로그인 → 인증 확인 → 성공 또는 오류 처리 흐름"
          }
          disabled={busy}
          onChange={(event) => {
            setPrompt(event.target.value);
            setPreview(null);
          }}
        />
      </label>
      {error && <p role="alert">{error}</p>}
      {!allowed(api) && (
        <p role="status">협업 또는 읽기 전용 모드에서는 사용할 수 없습니다.</p>
      )}
      <div className="personal-ai-diagram__actions">
        <button
          type="button"
          disabled={
            !session ||
            !model ||
            !prompt.trim() ||
            busy ||
            !current() ||
            (mode === "labels" && !selection.length) ||
            (mode === "extend" && !anchor)
          }
          onClick={generate}
        >
          {MagicIcon}
          {busy ? "생성 중" : "생성"}
        </button>
        {busy && (
          <button
            type="button"
            onClick={() => {
              invalidate();
              setBusy(false);
              setPreview(null);
            }}
          >
            취소
          </button>
        )}
        {backupExists && (
          <button
            type="button"
            title="마지막 적용 전 백업 다운로드"
            aria-label="마지막 적용 전 백업 다운로드"
            disabled={busy}
            onClick={download}
          >
            {downloadIcon}
          </button>
        )}
      </div>
      <div
        className={
          preview?.kind === "labels"
            ? "personal-ai-diagram__changes"
            : "personal-ai-diagram__preview"
        }
        aria-label="다이어그램 미리보기"
      >
        {preview?.kind === "labels" ? (
          <table>
            <thead>
              <tr>
                <th>변경 전</th>
                <th>변경 후</th>
              </tr>
            </thead>
            <tbody>
              {preview.changes.map((change) => (
                <tr key={change.id}>
                  <td>{change.before}</td>
                  <td>{change.after}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : previewURL ? (
          <img src={previewURL} alt={preview?.title ?? "다이어그램"} />
        ) : (
          <span>{busy ? "생성 중…" : "미리보기"}</span>
        )}
      </div>
      <div className="personal-ai-diagram__footer">
        <span>{preview?.title}</span>
        <button
          type="button"
          disabled={!preview || busy || !current()}
          onClick={apply}
        >
          {mode === "labels"
            ? "수정 적용"
            : mode === "extend"
            ? "단계·연결 추가"
            : "캔버스에 추가"}
        </button>
      </div>
    </div>
  );
};
