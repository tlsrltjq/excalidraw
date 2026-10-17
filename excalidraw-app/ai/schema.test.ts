import {
  diagramToMermaid,
  parseDiagram,
  parseLabelEdit,
  parseLabelTargets,
  parseDiagramExtension,
  parseAnchorContext,
} from "./schema";

const diagram = () => ({
  version: 1,
  title: "Synthetic flow",
  direction: "TD",
  nodes: [{ id: "end", label: "Start", kind: "process" }],
  edges: [] as { from: string; to: string; label: string }[],
});

describe("additive diagram extension", () => {
  const plan = {
    version: 1,
    title: "Retry",
    direction: "TD",
    nodes: [{ id: "n1", label: "Retry", kind: "process" }],
    edges: [{ from: "s1", to: "n1", label: "Failure" }],
  };
  it("accepts a new step attached to the selected anchor", () => {
    expect(parseDiagramExtension(plan)).toEqual(plan);
    expect(
      parseAnchorContext({ id: "s1", label: "Auth", kind: "decision" }).id,
    ).toBe("s1");
  });
  it.each([
    { ...plan, delete: ["s1"] },
    { ...plan, nodes: [{ id: "s1", label: "Overwrite", kind: "process" }] },
    { ...plan, nodes: [{ id: "real-id", label: "x", kind: "process" }] },
    { ...plan, edges: [{ from: "s2", to: "n1", label: "" }] },
    { ...plan, edges: [{ from: "n1", to: "n1", label: "" }] },
    { ...plan, edges: [...plan.edges, ...plan.edges] },
    { ...plan, edges: [] },
    {
      ...plan,
      nodes: [...plan.nodes, { id: "n2", label: "Detached", kind: "process" }],
    },
    { ...plan, nodes: Array(13).fill(plan.nodes[0]) },
    { ...plan, edges: Array(25).fill(plan.edges[0]) },
  ])("rejects unsafe or disconnected additions %#", (value) =>
    expect(() => parseDiagramExtension(value)).toThrow(),
  );
  it("rejects actual IDs and geometry in the context", () => {
    expect(() =>
      parseAnchorContext({ id: "actual-id", label: "Auth", kind: "process" }),
    ).toThrow();
    expect(() =>
      parseAnchorContext({ id: "s1", label: "Auth", kind: "process", x: 1 }),
    ).toThrow();
  });
});

describe("selected label operation schema", () => {
  const targets = [{ id: "t1", text: "Original\nlabel" }];
  it("accepts only selected aliases and returns plain text", () => {
    expect(parseLabelTargets(targets)).toEqual(targets);
    expect(
      parseLabelEdit(
        { version: 1, changes: [{ id: "t1", text: "New" }] },
        targets,
      ).changes[0].text,
    ).toBe("New");
  });
  it.each([
    { version: 1, changes: [{ id: "t2", text: "New" }] },
    { version: 1, changes: [{ id: "t1", text: "New", x: 4 }] },
    {
      version: 1,
      changes: [
        { id: "t1", text: "New" },
        { id: "t1", text: "Other" },
      ],
    },
    { version: 1, changes: [{ id: "t1", text: "x".repeat(121) }] },
    { version: 1, changes: [{ id: "t1", text: "New\nline" }] },
    { version: 1, changes: [], delete: ["t1"] },
  ])("rejects unsupported edits %#", (edit) =>
    expect(() => parseLabelEdit(edit, targets)).toThrow(),
  );
  it("rejects real element identifiers and oversized context", () => {
    expect(() =>
      parseLabelTargets([{ id: "real-element", text: "x" }]),
    ).toThrow();
    expect(() =>
      parseLabelTargets([{ id: "t1", text: "x".repeat(501) }]),
    ).toThrow();
    expect(() => parseLabelTargets(Array(25).fill(targets[0]))).toThrow();
  });
});

describe("AI diagram allowlist", () => {
  it("returns a validated copy without sharing model objects", () => {
    const input = diagram();
    const parsed = parseDiagram(input);
    expect(parsed).toEqual(input);
    expect(parsed.nodes[0]).not.toBe(input.nodes[0]);
  });
  it.each([
    { ...diagram(), tool: "delete" },
    { ...diagram(), nodes: [] },
    { ...diagram(), nodes: Array(25).fill(diagram().nodes[0]) },
    { ...diagram(), nodes: [...diagram().nodes, ...diagram().nodes] },
    { ...diagram(), nodes: [{ id: "a", label: "x", kind: "image" }] },
    { ...diagram(), title: "x\u202ey" },
    { ...diagram(), edges: [{ from: "end", to: "missing", label: "" }] },
    {
      ...diagram(),
      edges: Array(41).fill({ from: "end", to: "end", label: "" }),
    },
  ])("rejects malformed or unsupported output %#", (input) => {
    expect(() => parseDiagram(input)).toThrow();
  });
  it("keeps grammar, links and HTML inside escaped labels", () => {
    const input = diagram();
    input.nodes[0].label = '"]; click end "https://example.invalid" <script>';
    const source = diagramToMermaid(parseDiagram(input));
    expect(source).toContain("node_end[");
    expect(source).toContain("#34;");
    expect(source).not.toContain("https://");
    expect(source).not.toContain("<script>");
    expect(source.split("\n")).toHaveLength(2);
  });
});
