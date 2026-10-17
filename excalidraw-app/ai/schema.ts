export type Diagram = {
  version: 1;
  title: string;
  direction: "TD" | "LR";
  nodes: {
    id: string;
    label: string;
    kind: "process" | "decision" | "terminal";
  }[];
  edges: { from: string; to: string; label: string }[];
};

const text = { type: "string", minLength: 1, maxLength: 120 };
const id = { type: "string", pattern: "^[A-Za-z][A-Za-z0-9_]{0,31}$" };
export const diagramSchema = {
  type: "object",
  additionalProperties: false,
  required: ["version", "title", "direction", "nodes", "edges"],
  properties: {
    version: { type: "integer", const: 1 },
    title: text,
    direction: { type: "string", enum: ["TD", "LR"] },
    nodes: {
      type: "array",
      minItems: 1,
      maxItems: 24,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "label", "kind"],
        properties: {
          id,
          label: text,
          kind: { type: "string", enum: ["process", "decision", "terminal"] },
        },
      },
    },
    edges: {
      type: "array",
      maxItems: 40,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["from", "to", "label"],
        properties: {
          from: id,
          to: id,
          label: { type: "string", maxLength: 80 },
        },
      },
    },
  },
};

const object = (value: unknown, keys: string[]): Record<string, unknown> => {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).length !== keys.length ||
    Object.keys(value).some((key) => !keys.includes(key))
  ) {
    throw new Error("Invalid diagram structure");
  }
  return value as Record<string, unknown>;
};
const label = (value: unknown, max = 120, empty = false): string => {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (!empty && !value.trim()) ||
    // eslint-disable-next-line no-control-regex
    /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/.test(value)
  ) {
    throw new Error("Invalid diagram label");
  }
  return value;
};
const identifier = (value: unknown): string => {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(value)
  ) {
    throw new Error("Invalid diagram identifier");
  }
  return value;
};

export const parseDiagram = (value: unknown): Diagram => {
  const input = object(value, [
    "version",
    "title",
    "direction",
    "nodes",
    "edges",
  ]);
  if (
    input.version !== 1 ||
    !["TD", "LR"].includes(input.direction as string) ||
    !Array.isArray(input.nodes) ||
    input.nodes.length < 1 ||
    input.nodes.length > 24 ||
    !Array.isArray(input.edges) ||
    input.edges.length > 40
  ) {
    throw new Error("Invalid diagram limits");
  }
  const nodes = input.nodes.map((value) => {
    const node = object(value, ["id", "label", "kind"]);
    if (!["process", "decision", "terminal"].includes(node.kind as string)) {
      throw new Error("Invalid diagram shape");
    }
    return {
      id: identifier(node.id),
      label: label(node.label),
      kind: node.kind as Diagram["nodes"][number]["kind"],
    };
  });
  const ids = new Set(nodes.map((node) => node.id));
  if (ids.size !== nodes.length) {
    throw new Error("Duplicate diagram node");
  }
  const edges = input.edges.map((value) => {
    const edge = object(value, ["from", "to", "label"]);
    const from = identifier(edge.from);
    const to = identifier(edge.to);
    if (!ids.has(from) || !ids.has(to)) {
      throw new Error("Missing diagram node");
    }
    return { from, to, label: label(edge.label, 80, true) };
  });
  return {
    version: 1,
    title: label(input.title),
    direction: input.direction as Diagram["direction"],
    nodes,
    edges,
  };
};

// Escape every grammar-significant character in labels as Mermaid entities.
const quoted = (value: string) =>
  `"${Array.from(value, (char) =>
    /[A-Za-z0-9 \u0080-\uffff]/.test(char) ? char : `#${char.codePointAt(0)};`,
  ).join("")}"`;
export const diagramToMermaid = (value: Diagram) => {
  const diagram = parseDiagram(value);
  return [
    `flowchart ${diagram.direction}`,
    ...diagram.nodes.map((node) => {
      const content = quoted(node.label);
      return `node_${node.id}${
        node.kind === "decision"
          ? `{${content}}`
          : node.kind === "terminal"
          ? `([${content}])`
          : `[${content}]`
      }`;
    }),
    ...diagram.edges.map(
      (edge) =>
        `node_${edge.from} -->${
          edge.label ? `|${quoted(edge.label)}|` : ""
        } node_${edge.to}`,
    ),
  ].join("\n");
};
