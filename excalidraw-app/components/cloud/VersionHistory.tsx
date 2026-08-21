/**
 * Personal Excalidraw Cloud — version history dialog (Milestone 6,
 * DECISIONS.md D-012).
 *
 * Opened from a Dashboard row's history icon. Lists the drawing's recent
 * revisions (most recent first) and restores on request. No preview in
 * this minimal version — restoring is one click plus a confirm dialog.
 */
import { Dialog } from "@excalidraw/excalidraw/components/Dialog";
import { useEffect, useState } from "react";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { atom, useAtom } from "../../app-jotai";
import { getCurrentDrawing } from "../../cloud/currentDrawing";
import { getDrawing } from "../../cloud/drawings";
import { openCloudDrawing } from "../../cloud/openDrawing";
import { listRevisions, restoreRevision } from "../../cloud/revisions";

import "./VersionHistory.scss";

import type { RevisionSummary } from "../../cloud/revisions";

export type VersionHistoryTarget = { drawingId: string; title: string };
export const versionHistoryTargetAtom = atom<VersionHistoryTarget | null>(null);

type Props = {
  excalidrawAPI: ExcalidrawImperativeAPI | null;
};

const formatCreatedAt = (iso: string) => {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
};

export const VersionHistory: React.FC<Props> = ({ excalidrawAPI }) => {
  const [target, setTarget] = useAtom(versionHistoryTargetAtom);
  const [revisions, setRevisions] = useState<RevisionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!target) {
      return;
    }
    setRevisions(null);
    setError(null);
    listRevisions(target.drawingId)
      .then(setRevisions)
      .catch((e: any) => setError(e?.message ?? String(e)));
  }, [target]);

  if (!target) {
    return null;
  }

  const handleClose = () => setTarget(null);

  const handleRestore = async (revisionId: string) => {
    if (
      !window.confirm(
        "이 시점으로 복원할까요? 지금 상태도 히스토리에 새로 남아 다시 되돌릴 수 있습니다.",
      )
    ) {
      return;
    }
    setBusyId(revisionId);
    setError(null);
    try {
      const result = await restoreRevision(target.drawingId, revisionId);
      if (result.status === "conflict") {
        setError(
          "다른 곳에서 이 그림이 방금 바뀌어 복원하지 못했습니다. 다시 시도해주세요.",
        );
        return;
      }

      // if this drawing is open in the editor right now, refresh it so
      // what's on screen matches what was just restored.
      if (excalidrawAPI && getCurrentDrawing().drawingId === target.drawingId) {
        const fresh = await getDrawing(target.drawingId);
        if (fresh) {
          openCloudDrawing(excalidrawAPI, fresh);
        }
      }
      handleClose();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Dialog
      size="small"
      onCloseRequest={handleClose}
      title={`버전 기록 — ${target.title}`}
    >
      <div className="personal-cloud-version-history">
        {error && (
          <div className="personal-cloud-version-history__error" role="alert">
            {error}
          </div>
        )}

        {revisions === null && !error && (
          <div className="personal-cloud-version-history__empty">
            불러오는 중…
          </div>
        )}

        {revisions !== null && revisions.length === 0 && (
          <div className="personal-cloud-version-history__empty">
            아직 저장된 이전 버전이 없습니다. 편집하고 저장될 때마다 여기 기록이
            쌓입니다.
          </div>
        )}

        {revisions !== null && revisions.length > 0 && (
          <ul className="personal-cloud-version-history__list">
            {revisions.map((rev) => (
              <li key={rev.id} className="personal-cloud-version-history__row">
                <span className="personal-cloud-version-history__timestamp">
                  {formatCreatedAt(rev.createdAt)}
                </span>
                <button
                  type="button"
                  onClick={() => handleRestore(rev.id)}
                  disabled={busyId === rev.id}
                >
                  복원
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  );
};
