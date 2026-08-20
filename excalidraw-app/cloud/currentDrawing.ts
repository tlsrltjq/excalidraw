/**
 * Personal Excalidraw Cloud — "which Cloud drawing is currently open" state
 * (Milestone 4).
 *
 * `generation` increments every time the current drawing changes (open a
 * different one, close back to none). Async load/save operations capture
 * the generation they started with and compare it before applying results,
 * per ENGINEERING_GUARDRAILS.md #5 ("비동기 순서 역전") — a slow response
 * for drawing A that resolves after the user has already switched to B
 * gets silently dropped instead of clobbering B.
 */
import { atom, appJotaiStore } from "../app-jotai";

export type CurrentDrawingState = {
  drawingId: string | null;
  generation: number;
};

export const currentDrawingAtom = atom<CurrentDrawingState>({
  drawingId: null,
  generation: 0,
});

let nextGeneration = 0;

/** Returns the new generation number for this switch. */
export const setCurrentDrawing = (drawingId: string | null): number => {
  nextGeneration += 1;
  appJotaiStore.set(currentDrawingAtom, {
    drawingId,
    generation: nextGeneration,
  });
  return nextGeneration;
};

export const getCurrentDrawing = (): CurrentDrawingState =>
  appJotaiStore.get(currentDrawingAtom);
