import { diagramToMermaid, parseDiagram } from "./schema";

const diagram = () => ({
  version: 1,
  title: "Synthetic flow",
  direction: "TD",
  nodes: [{ id: "end", label: "Start", kind: "process" }],
  edges: [] as { from: string; to: string; label: string }[],
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
