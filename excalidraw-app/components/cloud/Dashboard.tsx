/**
 * Personal Excalidraw Cloud — Dashboard (Milestone 3 CRUD/UI, wired to
 * Milestone 4 autosave via `openCloudDrawing`/`adoptCloudDrawing`, and to
 * Milestone 6's `VersionHistory` dialog via the history icon per row).
 *
 * Lists the signed-in user's drawings and lets them create / open / rename
 * / delete. Opening or creating a drawing makes it the "current" Cloud
 * drawing, so further edits autosave automatically (see cloud/autosave.ts)
 * — the "현재 캔버스를 새 그림으로 저장" button is a manual seed/copy action,
 * not a substitute for that.
 */
import { Dialog } from "@excalidraw/excalidraw/components/Dialog";
import { FilledButton } from "@excalidraw/excalidraw/components/FilledButton";
import { TextField } from "@excalidraw/excalidraw/components/TextField";
import {
  PlusIcon,
  TrashIcon,
  exportToFileIcon,
  historyIcon,
  pencilIcon,
} from "@excalidraw/excalidraw/components/icons";
import { serializeAsJSON } from "@excalidraw/excalidraw/data/json";
import { useCallback, useEffect, useRef, useState } from "react";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { cloudSessionAtom, useCloudSession } from "../../cloud/session";

import { atom, appJotaiStore, useAtom, useSetAtom } from "../../app-jotai";
import { clearAutosaveBaseline } from "../../cloud/autosave";
import {
  createDrawing,
  deleteDrawing,
  getDrawing,
  listDrawings,
  renameDrawing,
} from "../../cloud/drawings";
import { adoptCloudDrawing, openCloudDrawing } from "../../cloud/openDrawing";
import {
  getCurrentDrawing,
  setCurrentDrawing,
} from "../../cloud/currentDrawing";
import { getDrawingIdFromUrl } from "../../cloud/urlDrawingId";
import { loadCloudDrawingFromUrl } from "../../cloud/urlDrawingLoader";

import "./Dashboard.scss";

import { versionHistoryTargetAtom } from "./VersionHistory";

import type { CloudDrawingSummary } from "../../cloud/types";

export const dashboardOpenAtom = atom(false);

type Props = {
  excalidrawAPI: ExcalidrawImperativeAPI | null;
};

const formatUpdatedAt = (iso: string) => {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
};

export const Dashboard: React.FC<Props> = ({ excalidrawAPI }) => {
  const [isOpen, setIsOpen] = useAtom(dashboardOpenAtom);
  const [drawings, setDrawings] = useState<CloudDrawingSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [urlLoadError, setUrlLoadError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const { status, session } = useCloudSession();
  const autoOpenedKeyRef = useRef<string | null>(null);
  const autoOpenPromiseRef = useRef<{
    key: string;
    promise: ReturnType<typeof getDrawing>;
  } | null>(null);
  const setVersionHistoryTarget = useSetAtom(versionHistoryTargetAtom);

  // Makes the `?drawing=<uuid>` URL (D-006) meaningful: reloading or
  // sharing the URL reopens the same drawing. Runs once, silently (doesn't
  // open this dialog), as soon as we know the user is signed in and the
  // editor is ready.
  useEffect(() => {
    if (!excalidrawAPI || status !== "signed-in") {
      return;
    }
    const id = getDrawingIdFromUrl();
    const userId = session?.user.id;
    if (!id || !userId) {
      return;
    }
    const requestKey = `${userId}:${id}`;
    if (autoOpenedKeyRef.current === requestKey) {
      return;
    }
    if (autoOpenPromiseRef.current?.key !== requestKey) {
      autoOpenPromiseRef.current = {
        key: requestKey,
        promise: getDrawing(id),
      };
    }
    const drawingPromise = autoOpenPromiseRef.current.promise;
    const generation = getCurrentDrawing().generation;

    let cancelled = false;
    const isCurrent = () =>
      !cancelled &&
      getDrawingIdFromUrl() === id &&
      getCurrentDrawing().generation === generation &&
      appJotaiStore.get(cloudSessionAtom).session?.user.id === userId;

    void loadCloudDrawingFromUrl({
      drawingId: id,
      getDrawing: () => drawingPromise,
      isCurrent,
      openDrawing: (drawing) => openCloudDrawing(excalidrawAPI, drawing),
    }).then((result) => {
      if (autoOpenPromiseRef.current?.promise === drawingPromise) {
        autoOpenPromiseRef.current = null;
      }
      if (result.status === "stale") {
        return;
      }
      autoOpenedKeyRef.current = requestKey;
      if (result.status === "opened") {
        setUrlLoadError(null);
        return;
      }

      clearAutosaveBaseline();
      setCurrentDrawing(null);
      setUrlLoadError(
        result.status === "not-found"
          ? "이 Cloud 그림을 찾을 수 없거나 접근 권한이 없습니다. 현재 캔버스는 그대로 유지되지만 요청한 그림에서 불러온 내용은 아닙니다. 다른 그림 또는 이 브라우저의 로컬 데이터일 수 있으며, Cloud 자동 저장 연결은 해제했습니다."
          : "Cloud 그림을 불러오지 못했습니다. 네트워크와 접근 권한을 확인해 주세요. 현재 캔버스는 그대로 유지되지만 요청한 그림에서 불러온 내용은 아닙니다. Cloud 자동 저장 연결은 해제했습니다.",
      );
      setIsOpen(true);
    });

    return () => {
      cancelled = true;
    };
  }, [excalidrawAPI, session?.user.id, setIsOpen, status]);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      setDrawings(await listDrawings());
    } catch (e: any) {
      setError(e?.message ?? String(e));
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      setDrawings(null);
      refresh();
    }
  }, [isOpen, refresh]);

  if (!isOpen) {
    return null;
  }

  const handleClose = () => setIsOpen(false);

  const handleCreate = async () => {
    if (!excalidrawAPI) {
      return;
    }
    setCreating(true);
    setError(null);
    setUrlLoadError(null);
    try {
      const drawing = await createDrawing();
      openCloudDrawing(excalidrawAPI, drawing);
      setIsOpen(false);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setCreating(false);
    }
  };

  const handleSaveCurrent = async () => {
    if (!excalidrawAPI) {
      return;
    }
    const title = window.prompt("그림 이름을 입력하세요", "제목 없는 그림");
    if (title === null) {
      return;
    }
    setSaving(true);
    setError(null);
    setUrlLoadError(null);
    try {
      const elements = excalidrawAPI.getSceneElements();
      const appState = excalidrawAPI.getAppState();
      const files = excalidrawAPI.getFiles();
      const sceneData = JSON.parse(
        serializeAsJSON(elements, appState, files, "database"),
      );
      const drawing = await createDrawing(title || "제목 없는 그림", sceneData);
      // content is already on screen — just adopt it as the current
      // drawing so further edits autosave into it, no scene reload needed.
      adoptCloudDrawing(drawing, elements, appState, files);
      await refresh();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleOpen = async (id: string) => {
    if (!excalidrawAPI) {
      return;
    }
    setBusyId(id);
    setError(null);
    setUrlLoadError(null);
    try {
      const drawing = await getDrawing(id);
      if (!drawing) {
        setError("그림을 찾을 수 없습니다. 이미 삭제됐을 수 있습니다.");
        await refresh();
        return;
      }
      openCloudDrawing(excalidrawAPI, drawing);
      setIsOpen(false);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusyId(null);
    }
  };

  const startRename = (drawing: CloudDrawingSummary) => {
    setRenamingId(drawing.id);
    setRenameValue(drawing.title);
  };

  const commitRename = async (id: string) => {
    const title = renameValue.trim();
    setRenamingId(null);
    if (!title) {
      return;
    }
    setBusyId(id);
    setError(null);
    try {
      await renameDrawing(id, title);
      await refresh();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("이 그림을 삭제할까요? 되돌릴 수 없습니다.")) {
      return;
    }
    setBusyId(id);
    setError(null);
    try {
      await deleteDrawing(id);
      await refresh();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Dialog size="regular" onCloseRequest={handleClose} title="내 그림">
      <div className="personal-cloud-dashboard">
        <div className="personal-cloud-dashboard__toolbar">
          <FilledButton
            variant="outlined"
            label="현재 캔버스를 새 그림으로 저장"
            icon={exportToFileIcon}
            onClick={handleSaveCurrent}
            disabled={saving || !excalidrawAPI}
          />
          <FilledButton
            label="새 그림 만들기"
            icon={PlusIcon}
            onClick={handleCreate}
            disabled={creating || !excalidrawAPI}
          />
        </div>

        {error && (
          <div className="personal-cloud-dashboard__error" role="alert">
            {error}
          </div>
        )}

        {urlLoadError && (
          <div className="personal-cloud-dashboard__error" role="alert">
            {urlLoadError}
          </div>
        )}

        {drawings === null && !error && (
          <div className="personal-cloud-dashboard__empty">불러오는 중…</div>
        )}

        {drawings !== null && drawings.length === 0 && (
          <div className="personal-cloud-dashboard__empty">
            아직 그림이 없습니다. "새 그림 만들기"로 시작하세요.
          </div>
        )}

        {drawings !== null && drawings.length > 0 && (
          <ul className="personal-cloud-dashboard__list">
            {drawings.map((drawing) => (
              <li key={drawing.id} className="personal-cloud-dashboard__row">
                {renamingId === drawing.id ? (
                  <TextField
                    value={renameValue}
                    onChange={setRenameValue}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        commitRename(drawing.id);
                      } else if (event.key === "Escape") {
                        setRenamingId(null);
                      }
                    }}
                    selectOnRender
                  />
                ) : (
                  <button
                    type="button"
                    className="personal-cloud-dashboard__title"
                    onClick={() => handleOpen(drawing.id)}
                    disabled={busyId === drawing.id}
                  >
                    {drawing.title}
                  </button>
                )}

                <span className="personal-cloud-dashboard__updatedAt">
                  {formatUpdatedAt(drawing.updatedAt)}
                </span>

                <button
                  type="button"
                  aria-label="이름 변경"
                  className="personal-cloud-dashboard__iconButton"
                  onClick={() => startRename(drawing)}
                  disabled={busyId === drawing.id}
                >
                  {pencilIcon}
                </button>
                <button
                  type="button"
                  aria-label="버전 기록"
                  className="personal-cloud-dashboard__iconButton"
                  onClick={() => {
                    setIsOpen(false);
                    setVersionHistoryTarget({
                      drawingId: drawing.id,
                      title: drawing.title,
                    });
                  }}
                  disabled={busyId === drawing.id}
                >
                  {historyIcon}
                </button>
                <button
                  type="button"
                  aria-label="삭제"
                  className="personal-cloud-dashboard__iconButton"
                  onClick={() => handleDelete(drawing.id)}
                  disabled={busyId === drawing.id}
                >
                  {TrashIcon}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  );
};
