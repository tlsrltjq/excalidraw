import { API } from "@excalidraw/excalidraw/tests/helpers/api";

import type { BinaryFileData, DataURL } from "@excalidraw/excalidraw/types";
import type { FileId } from "@excalidraw/element/types";

import { FileManager } from "./FileManager";

const id = "TEST-same-id" as FileId;
const data = (version: number) =>
  ({
    id,
    mimeType: "image/png",
    dataURL: "data:image/png;base64,VEVTVA==" as DataURL,
    created: 1,
    version,
  } as BinaryFileData);
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

it("does not publish old fetch status or clear a new same-ID marker after reset", async () => {
  type Result = {
    loadedFiles: BinaryFileData[];
    erroredFiles: Map<FileId, true>;
  };
  const old = deferred<Result>();
  const next = deferred<Result>();
  const status = vi.fn();
  const manager = new FileManager({
    getFiles: vi
      .fn()
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(next.promise),
    saveFiles: vi.fn(),
    onFileStatusChange: status,
  });
  const oldResult = expect(manager.getFiles([id])).rejects.toHaveProperty(
    "name",
    "AbortError",
  );
  manager.reset();
  const nextResult = manager.getFiles([id]);
  const notifications = status.mock.calls.length;
  old.resolve({ loadedFiles: [data(1)], erroredFiles: new Map() });
  await oldResult;
  expect(status).toHaveBeenCalledTimes(notifications);
  expect(manager.isFileTracked(id)).toBe(true);
  next.resolve({ loadedFiles: [data(2)], erroredFiles: new Map() });
  expect((await nextResult).loadedFiles[0].version).toBe(2);
});

it("does not clear the new saving marker or mark stale files saved after reset", async () => {
  type Result = {
    savedFiles: Map<FileId, BinaryFileData>;
    erroredFiles: Map<FileId, BinaryFileData>;
  };
  const old = deferred<Result>();
  const next = deferred<Result>();
  const manager = new FileManager({
    getFiles: vi.fn(),
    saveFiles: vi
      .fn()
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(next.promise),
  });
  const image = API.createElement({
    type: "image",
    fileId: id,
    status: "pending",
  });
  const oldResult = expect(
    manager.saveFiles({ elements: [image], files: { [id]: data(1) } }),
  ).rejects.toHaveProperty("name", "AbortError");
  manager.reset();
  const nextResult = manager.saveFiles({
    elements: [image],
    files: { [id]: data(2) },
  });
  old.resolve({
    savedFiles: new Map([[id, data(1)]]),
    erroredFiles: new Map(),
  });
  await oldResult;
  expect(manager.shouldPreventUnload([image])).toBe(true);
  expect(manager.shouldUpdateImageElementStatus(image)).toBe(false);
  next.resolve({
    savedFiles: new Map([[id, data(2)]]),
    erroredFiles: new Map(),
  });
  await nextResult;
  expect(manager.shouldPreventUnload([image])).toBe(false);
  expect(manager.shouldUpdateImageElementStatus(image)).toBe(true);
});
