import {
  createFolder,
  loadFolderWorkspace,
  moveDrawingToFolder,
  renameFolder,
} from "./folders";

const { from, builder } = vi.hoisted(() => {
  const builder = {
    select: vi.fn(),
    order: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    eq: vi.fn(),
    single: vi.fn(),
    upsert: vi.fn(),
  };
  return { from: vi.fn(), builder };
});
vi.mock("./supabaseClient", () => ({ supabase: { from } }));

beforeEach(() => {
  vi.resetAllMocks();
  from.mockReturnValue(builder);
  for (const name of ["select", "insert", "update", "delete", "eq"] as const) {
    builder[name].mockReturnValue(builder);
  }
  builder.single.mockResolvedValue({
    data: { id: "folder", name: "Work" },
    error: null,
  });
});

it("trims names, never sends client ownership", async () => {
  await createFolder("  Work  ");
  expect(builder.insert).toHaveBeenCalledWith({ name: "Work" });
  await expect(createFolder(" ")).rejects.toThrow();
  await expect(renameFolder("folder", "x".repeat(101))).rejects.toThrow();
});

it("moves atomically with one upsert and propagates permission errors", async () => {
  builder.upsert.mockResolvedValue({ error: null });
  await moveDrawingToFolder("drawing", "folder");
  expect(builder.upsert).toHaveBeenCalledWith(
    { drawing_id: "drawing", folder_id: "folder" },
    { onConflict: "drawing_id" },
  );
  builder.upsert.mockResolvedValue({ error: new Error("denied") });
  await expect(moveDrawingToFolder("drawing", "foreign")).rejects.toThrow(
    "denied",
  );
});

it("builds assignments from separate workspace tables", async () => {
  builder.order.mockResolvedValue({
    data: [{ id: "folder", name: "Work" }],
    error: null,
  });
  builder.select.mockImplementation((columns: string) =>
    columns === "drawing_id, folder_id"
      ? Promise.resolve({
          data: [{ drawing_id: "drawing", folder_id: "folder" }],
          error: null,
        })
      : builder,
  );
  expect(await loadFolderWorkspace()).toEqual({
    folders: [{ id: "folder", name: "Work" }],
    assignments: { drawing: "folder" },
  });
});
