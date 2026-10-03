import { loadCloudDrawingFromUrl } from "./urlDrawingLoader";

import type { CloudDrawing } from "./types";

const drawing = { id: "drawing-1" } as CloudDrawing;

describe("loadCloudDrawingFromUrl", () => {
  it("opens the drawing only while the request is current", async () => {
    const openDrawing = vi.fn();

    const result = await loadCloudDrawingFromUrl({
      drawingId: drawing.id,
      getDrawing: async () => drawing,
      isCurrent: () => true,
      openDrawing,
    });

    expect(result).toEqual({ status: "opened" });
    expect(openDrawing).toHaveBeenCalledWith(drawing);
  });

  it("reports a missing or inaccessible drawing without opening anything", async () => {
    const openDrawing = vi.fn();

    const result = await loadCloudDrawingFromUrl({
      drawingId: drawing.id,
      getDrawing: async () => null,
      isCurrent: () => true,
      openDrawing,
    });

    expect(result).toEqual({ status: "not-found" });
    expect(openDrawing).not.toHaveBeenCalled();
  });

  it("reports a current network error for the UI to handle", async () => {
    const error = new Error("network unavailable");
    const openDrawing = vi.fn();

    const result = await loadCloudDrawingFromUrl({
      drawingId: drawing.id,
      getDrawing: async () => {
        throw error;
      },
      isCurrent: () => true,
      openDrawing,
    });

    expect(result).toEqual({ status: "failed", error });
    expect(openDrawing).not.toHaveBeenCalled();
  });

  it("ignores a late response after the request becomes stale", async () => {
    let resolveDrawing!: (value: CloudDrawing) => void;
    let isCurrent = true;
    const openDrawing = vi.fn();
    const getDrawing = () =>
      new Promise<CloudDrawing>((resolve) => {
        resolveDrawing = resolve;
      });

    const resultPromise = loadCloudDrawingFromUrl({
      drawingId: drawing.id,
      getDrawing,
      isCurrent: () => isCurrent,
      openDrawing,
    });
    isCurrent = false;
    resolveDrawing(drawing);

    expect(await resultPromise).toEqual({ status: "stale" });
    expect(openDrawing).not.toHaveBeenCalled();
  });
});
