import { CaptureUpdateAction, Fonts } from "@excalidraw/excalidraw";
import { arrayToMap } from "@excalidraw/common";
import {
  computeBoundTextPosition,
  getBoundTextMaxHeight,
  getBoundTextMaxWidth,
  getSelectedElements,
  isTextElement,
  isValidTextContainer,
  newElementWith,
  refreshTextDimensions,
} from "@excalidraw/element";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type {
  ExcalidrawElement,
  ExcalidrawTextElementWithContainer,
} from "@excalidraw/element/types";

import { canvasMatches } from "./editor";
import { parseLabelEdit, parseLabelTargets } from "./schema";

import type { CanvasSnapshot } from "./editor";
import type { LabelEdit } from "./schema";

export const selectedLabelTargets = (api: ExcalidrawImperativeAPI) => {
  const selected = getSelectedElements(
    api.getSceneElements(),
    api.getAppState(),
    { includeBoundTextElement: true },
  ).filter(isTextElement);
  const targets = selected.map((element, i) => ({
    id: `t${i + 1}`,
    text: element.originalText,
    elementId: element.id,
  }));
  parseLabelTargets(targets.map(({ id, text }) => ({ id, text })));
  return targets;
};
export type LabelSelection = ReturnType<typeof selectedLabelTargets>;
export type LabelPreview = {
  elements: readonly ExcalidrawElement[];
  changes: { id: string; before: string; after: string }[];
  selection: LabelSelection;
};
export const labelSelectionMatches = (
  api: ExcalidrawImperativeAPI,
  selection: LabelSelection,
) => {
  try {
    return (
      JSON.stringify(selectedLabelTargets(api)) === JSON.stringify(selection)
    );
  } catch {
    return false;
  }
};

export const createLabelPreview = async (
  api: ExcalidrawImperativeAPI,
  input: LabelEdit,
  selection: LabelSelection,
): Promise<LabelPreview> => {
  const edit = parseLabelEdit(
    input,
    selection.map(({ id, text }) => ({ id, text })),
  );
  if (!labelSelectionMatches(api, selection)) {
    throw new Error("Selection changed");
  }
  const existing = api.getSceneElementsIncludingDeleted();
  const elementsMap = arrayToMap(existing);
  const changes: LabelPreview["changes"] = [];
  const replacements = new Map<string, ExcalidrawElement>();
  const requestedText = new Map(
    edit.changes.map((change) => [
      selection.find((target) => target.id === change.id)!.elementId,
      change.text,
    ]),
  );
  await Fonts.loadElementsFonts(
    existing
      .filter((el) => requestedText.has(el.id))
      .map((el) =>
        isTextElement(el)
          ? newElementWith(el, {
              text: requestedText.get(el.id)!,
            })
          : el,
      ),
  );
  for (const change of edit.changes) {
    const target = selection.find((target) => target.id === change.id)!;
    const element = elementsMap.get(target.elementId);
    if (
      !element ||
      element.isDeleted ||
      !isTextElement(element) ||
      element.locked ||
      !Number.isFinite(element.fontSize) ||
      element.fontSize <= 0 ||
      element.fontSize > 512 ||
      ![element.width, element.height].every(
        (value) => Number.isFinite(value) && value > 0 && value <= 20000,
      ) ||
      element.boundElements?.some((bound) => bound.type === "arrow")
    ) {
      throw new Error("Unsupported text target");
    }
    if (element.originalText === change.text) {
      continue;
    }
    const container = element.containerId
      ? elementsMap.get(element.containerId)
      : null;
    if (
      element.containerId &&
      (!container ||
        container.isDeleted ||
        container.locked ||
        !isValidTextContainer(container) ||
        !container.boundElements?.some(
          (bound) => bound.type === "text" && bound.id === element.id,
        ))
    ) {
      throw new Error("Unsupported text container");
    }
    const bound =
      container && isValidTextContainer(container) ? container : null;
    const maxWidth = bound
      ? getBoundTextMaxWidth(bound, element)
      : element.width;
    const maxHeight = bound
      ? getBoundTextMaxHeight(
          bound,
          element as ExcalidrawTextElementWithContainer,
        )
      : element.height;
    let fitted: ExcalidrawElement | null = null;
    const minimum = Math.min(12, element.fontSize);
    for (
      let fontSize = element.fontSize;
      fontSize >= minimum;
      fontSize = Math.max(minimum, fontSize - 1)
    ) {
      const candidate = newElementWith(element, {
        fontSize,
        autoResize: !!bound,
        originalText: change.text,
      });
      const dimensions = refreshTextDimensions(
        candidate,
        bound,
        elementsMap,
        change.text,
      );
      if (
        dimensions &&
        dimensions.width <= maxWidth + 0.1 &&
        dimensions.height <= maxHeight + 0.1
      ) {
        const updated = newElementWith(element, {
          ...dimensions,
          fontSize,
          originalText: change.text,
        });
        fitted = bound
          ? newElementWith(
              updated,
              computeBoundTextPosition(
                bound,
                updated as ExcalidrawTextElementWithContainer,
                elementsMap,
              ),
            )
          : updated;
        break;
      }
      if (fontSize === minimum) {
        break;
      }
    }
    if (!fitted) {
      throw new Error("문구가 도형에 맞지 않습니다. 더 짧게 요청해주세요.");
    }
    replacements.set(element.id, fitted);
    changes.push({ id: target.id, before: target.text, after: change.text });
  }
  if (!changes.length) {
    throw new Error("변경할 문구가 없습니다. 다른 요청을 입력해주세요.");
  }
  return {
    elements: existing.map(
      (element) => replacements.get(element.id) ?? element,
    ),
    changes,
    selection,
  };
};

export const applyLabelPreview = async (
  api: ExcalidrawImperativeAPI,
  preview: LabelPreview,
  baseline: CanvasSnapshot,
  current: () => boolean,
  backup: () => Promise<void>,
) => {
  const check = () => {
    if (
      !current() ||
      api.getAppState().viewModeEnabled ||
      !canvasMatches(api, baseline) ||
      !labelSelectionMatches(api, preview.selection)
    ) {
      throw new Error("Canvas or selection changed");
    }
  };
  check();
  await backup();
  check();
  api.updateScene({
    elements: preview.elements,
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
};
