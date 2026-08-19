/**
 * Personal Excalidraw Cloud — Dashboard (Milestone 3).
 *
 * Lists the signed-in user's drawings and lets them create / open / rename
 * / delete. Cloud autosave doesn't exist yet (Milestone 4) — opening a
 * drawing loads it into the editor via restoreElements/restoreAppState, but
 * further edits aren't written back until autosave lands.
 */
import { Dialog } from "@excalidraw/excalidraw/components/Dialog";
import { FilledButton } from "@excalidraw/excalidraw/components/FilledButton";
import { TextField } from "@excalidraw/excalidraw/components/TextField";
import {
  PlusIcon,
  TrashIcon,
  exportToFileIcon,
  pencilIcon,
} from "@excalidraw/excalidraw/components/icons";
import {
  restoreAppState,
  restoreElements,
} from "@excalidraw/excalidraw/data/restore";
import { serializeAsJSON } from "@excalidraw/excalidraw/data/json";
import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import { useCallback, useEffect, useRef, useState } from "react";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { useCloudSession } from "../../cloud/session";

import { atom, useAtom } from "../../app-jotai";
import {
  createDrawing,
  deleteDrawing,
  getDrawing,
  listDrawings,
  renameDrawing,
} from "../../cloud/drawings";
import {
  getDrawingIdFromUrl,
  setDrawingIdInUrl,
} from "../../cloud/urlDrawingId";

import "./Dashboard.scss";

import type { CloudDrawing, CloudDrawingSummary } from "../../cloud/types";

export const dashboardOpenAtom = atom(false);

type Props = {
  excalidrawAPI: ExcalidrawImperativeAPI | null;
};

const applyDrawingToEditor = (
  excalidrawAPI: ExcalidrawImperativeAPI,
  drawing: CloudDrawing,
) => {
  excalidrawAPI.updateScene({
    elements: restoreElements(drawing.sceneData.elements, null, {
      repairBindings: true,
      deleteInvisibleElements: true,
    }),
    appState: restoreAppState(drawing.sceneData.appState, null),
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
  setDrawingIdInUrl(drawing.id);
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
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const { status } = useCloudSession();
  const autoOpenedRef = useRef(false);

  // Makes the `?drawing=<uuid>` URL (D-006) meaningful: reloading or
  // sharing the URL reopens the same drawing. Runs once, silently (doesn't
  // open this dialog), as soon as we know the user is signed in and the
  // editor is ready.
  useEffect(() => {
    if (autoOpenedRef.current || !excalidrawAPI || status !== "signed-in") {
      return;
    }
    const id = getDrawingIdFromUrl();
    if (!id) {
      return;
    }
    autoOpenedRef.current = true;
    (async () => {
      try {
        const drawing = await getDrawing(id);
        if (drawing) {
          applyDrawingToEditor(excalidrawAPI, drawing);
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(
          "[personal-cloud] failed to auto-open drawing from URL",
          e,
        );
      }
    })();
  }, [excalidrawAPI, status]);

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
    try {
      const drawing = await createDrawing();
      applyDrawingToEditor(excalidrawAPI, drawing);
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
    try {
      const elements = excalidrawAPI.getSceneElements();
      const appState = excalidrawAPI.getAppState();
      const files = excalidrawAPI.getFiles();
      const sceneData = JSON.parse(
        serializeAsJSON(elements, appState, files, "database"),
      );
      const drawing = await createDrawing(title || "제목 없는 그림", sceneData);
      setDrawingIdInUrl(drawing.id);
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
    try {
      const drawing = await getDrawing(id);
      if (!drawing) {
        setError("그림을 찾을 수 없습니다. 이미 삭제됐을 수 있습니다.");
        await refresh();
        return;
      }
      applyDrawingToEditor(excalidrawAPI, drawing);
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
