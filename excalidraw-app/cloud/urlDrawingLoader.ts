import type { CloudDrawing } from "./types";

export type UrlDrawingLoadResult =
  | { status: "opened" }
  | { status: "not-found" }
  | { status: "failed"; error: unknown }
  | { status: "stale" };

export const loadCloudDrawingFromUrl = async (opts: {
  drawingId: string;
  getDrawing: (drawingId: string) => Promise<CloudDrawing | null>;
  isCurrent: () => boolean;
  openDrawing: (drawing: CloudDrawing) => void;
}): Promise<UrlDrawingLoadResult> => {
  try {
    const drawing = await opts.getDrawing(opts.drawingId);
    if (!opts.isCurrent()) {
      return { status: "stale" };
    }
    if (!drawing) {
      return { status: "not-found" };
    }
    opts.openDrawing(drawing);
    return { status: "opened" };
  } catch (error) {
    return opts.isCurrent() ? { status: "failed", error } : { status: "stale" };
  }
};
