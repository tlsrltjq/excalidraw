/**
 * Personal Excalidraw Cloud — save status pill (Milestone 4).
 *
 * Shows nothing unless a Cloud drawing is currently open (anonymous
 * local-first editing is completely unaffected — DECISIONS.md D-004).
 * Handles three mutually exclusive states: normal save status, a
 * revision-conflict prompt (D-007), and a "found an unsynced local draft"
 * prompt from `openDrawing.ts`.
 */
import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import { serializeAsJSON } from "@excalidraw/excalidraw/data/json";
import { useState } from "react";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { useAtom, useAtomValue } from "../../app-jotai";
import {
  localDraftPromptAtom,
  pauseAutosave,
  primeAutosaveBaseline,
  resumeAutosave,
  saveStatusAtom,
  scheduleAutosave,
  flushAutosave,
} from "../../cloud/autosave";
import { currentDrawingAtom } from "../../cloud/currentDrawing";
import {
  createDrawing,
  getDrawing,
  updateDrawingScene,
} from "../../cloud/drawings";
import { clearLocalDraft } from "../../cloud/localDraftStore";
import { adoptCloudDrawing, openCloudDrawing } from "../../cloud/openDrawing";

import "./CloudSaveStatus.scss";

type Props = {
  excalidrawAPI: ExcalidrawImperativeAPI | null;
};

export const CloudSaveStatus: React.FC<Props> = ({ excalidrawAPI }) => {
  const status = useAtomValue(saveStatusAtom);
  const currentDrawing = useAtomValue(currentDrawingAtom);
  const [localDraftPrompt, setLocalDraftPrompt] = useAtom(localDraftPromptAtom);
  const [busy, setBusy] = useState(false);

  if (!currentDrawing.drawingId || !excalidrawAPI) {
    return null;
  }
  const drawingId = currentDrawing.drawingId;

  if (localDraftPrompt && localDraftPrompt.drawingId === drawingId) {
    const useLocalDraft = () => {
      pauseAutosave();
      excalidrawAPI.updateScene({
        elements: localDraftPrompt.elements,
        appState: localDraftPrompt.appState,
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });
      setTimeout(resumeAutosave, 0);
      setLocalDraftPrompt(null);
      // this local draft is, by definition, not yet on the server — save it now.
      scheduleAutosave(
        localDraftPrompt.elements,
        localDraftPrompt.appState,
        {},
      );
      flushAutosave();
    };

    const useServerVersion = () => {
      void clearLocalDraft(drawingId);
      setLocalDraftPrompt(null);
    };

    return (
      <div className="personal-cloud-save-status personal-cloud-save-status--prompt">
        <span>이 그림에 저장되지 않은 로컬 변경사항이 있습니다.</span>
        <button type="button" onClick={useLocalDraft}>
          로컬 변경 사용
        </button>
        <button type="button" onClick={useServerVersion}>
          서버 버전 사용
        </button>
      </div>
    );
  }

  if (status.status === "conflict") {
    const reloadRemote = async () => {
      setBusy(true);
      try {
        const drawing = await getDrawing(drawingId);
        if (drawing) {
          openCloudDrawing(excalidrawAPI, drawing);
        } else {
          window.alert(
            "이 그림은 더 이상 존재하지 않습니다 (삭제됐을 수 있습니다).",
          );
        }
      } finally {
        setBusy(false);
      }
    };

    const saveAsCopy = async () => {
      const title = window.prompt("복사본 이름을 입력하세요", "복사본");
      if (title === null) {
        return;
      }
      setBusy(true);
      try {
        const elements = excalidrawAPI.getSceneElements();
        const appState = excalidrawAPI.getAppState();
        const files = excalidrawAPI.getFiles();
        const sceneData = JSON.parse(
          serializeAsJSON(elements, appState, files, "database"),
        );
        const drawing = await createDrawing(title || "복사본", sceneData);
        adoptCloudDrawing(drawing, elements, appState, files);
      } catch (e: any) {
        window.alert(e?.message ?? String(e));
      } finally {
        setBusy(false);
      }
    };

    const overwrite = async () => {
      if (
        !window.confirm(
          "서버의 최신 내용을 지금 편집 중인 내용으로 덮어쓸까요?",
        )
      ) {
        return;
      }
      setBusy(true);
      try {
        const latest = await getDrawing(drawingId);
        if (!latest) {
          window.alert(
            "이 그림은 더 이상 존재하지 않습니다 (삭제됐을 수 있습니다).",
          );
          return;
        }
        const elements = excalidrawAPI.getSceneElements();
        const appState = excalidrawAPI.getAppState();
        const files = excalidrawAPI.getFiles();
        const sceneData = JSON.parse(
          serializeAsJSON(elements, appState, files, "database"),
        );
        const result = await updateDrawingScene(
          drawingId,
          sceneData,
          latest.revision,
        );
        if (result.status === "ok") {
          primeAutosaveBaseline(
            drawingId,
            result.revision,
            elements,
            appState,
            files,
          );
        }
        // if it conflicted again (rare race), status stays "conflict" and
        // the user can just try again.
      } catch (e: any) {
        window.alert(e?.message ?? String(e));
      } finally {
        setBusy(false);
      }
    };

    return (
      <div className="personal-cloud-save-status personal-cloud-save-status--conflict">
        <span>다른 곳에서 이 그림이 먼저 저장됐습니다.</span>
        <button type="button" onClick={reloadRemote} disabled={busy}>
          원격 새로고침
        </button>
        <button type="button" onClick={saveAsCopy} disabled={busy}>
          복사본으로 저장
        </button>
        <button type="button" onClick={overwrite} disabled={busy}>
          덮어쓰기
        </button>
      </div>
    );
  }

  const label = (() => {
    switch (status.status) {
      case "saving":
        return "저장 중…";
      case "saved":
        return "저장됨";
      case "offline":
        return "오프라인 — 재연결되면 저장됩니다";
      case "error":
        return `저장 실패: ${status.message}`;
      default:
        return null;
    }
  })();

  if (!label) {
    return null;
  }

  return (
    <div
      className={`personal-cloud-save-status personal-cloud-save-status--${status.status}`}
    >
      {label}
    </div>
  );
};
