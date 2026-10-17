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

export type LabelTarget = { id: string; text: string };
export type LabelEdit = { version: 1; changes: LabelTarget[] };
export const labelEditSchema = {
  type: "object",
  additionalProperties: false,
  required: ["version", "changes"],
  properties: {
    version: { type: "integer", const: 1 },
    changes: {
      type: "array",
      minItems: 1,
      maxItems: 24,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "text"],
        properties: {
          id: { type: "string", pattern: "^t([1-9]|1[0-9]|2[0-4])$" },
          text,
        },
      },
    },
  },
};
export const parseLabelTargets = (value: unknown): LabelTarget[] => {
  if (!Array.isArray(value) || !value.length || value.length > 24) {
    throw new Error("Invalid text selection");
  }
  const seen = new Set<string>();
  return value.map((item) => {
    const target = object(item, ["id", "text"]);
    const id = identifier(target.id);
    if (!/^t([1-9]|1[0-9]|2[0-4])$/.test(id) || seen.has(id)) {
      throw new Error("Invalid text alias");
    }
    seen.add(id);
    if (typeof target.text !== "string" || target.text.length > 500) {
      throw new Error("Invalid text input");
    }
    // Original text can contain line breaks; generated labels remain one line.
    label(target.text.replace(/\r?\n/g, " "), 500);
    return { id, text: target.text };
  });
};
export const parseLabelEdit = (
  value: unknown,
  targets: readonly LabelTarget[],
): LabelEdit => {
  const input = object(value, ["version", "changes"]);
  if (
    input.version !== 1 ||
    !Array.isArray(input.changes) ||
    !input.changes.length ||
    input.changes.length > 24
  ) {
    throw new Error("Invalid text operation");
  }
  const allowed = new Set(
    parseLabelTargets(targets).map((target) => target.id),
  );
  const seen = new Set<string>();
  const changes = input.changes.map((value) => {
    const change = object(value, ["id", "text"]);
    const id = identifier(change.id);
    if (!allowed.has(id) || seen.has(id)) {
      throw new Error("Unknown or repeated text target");
    }
    seen.add(id);
    return { id, text: label(change.text) };
  });
  return { version: 1, changes };
};

export type AnchorContext = {
  id: "s1";
  label: string;
  kind: Diagram["nodes"][number]["kind"];
};
export const parseAnchorContext = (value: unknown): AnchorContext => {
  const anchor = object(value, ["id", "label", "kind"]);
  if (
    anchor.id !== "s1" ||
    !["process", "decision", "terminal"].includes(anchor.kind as string)
  ) {
    throw new Error("Invalid anchor");
  }
  return {
    id: "s1",
    label: label(anchor.label, 500, true),
    kind: anchor.kind as AnchorContext["kind"],
  };
};
export type DiagramExtension = Diagram;
export const extensionSchema = {
  ...diagramSchema,
  properties: {
    ...diagramSchema.properties,
    nodes: {
      ...diagramSchema.properties.nodes,
      maxItems: 12,
      items: {
        ...diagramSchema.properties.nodes.items,
        properties: {
          ...diagramSchema.properties.nodes.items.properties,
          id: { type: "string", pattern: "^n([1-9]|1[0-2])$" },
        },
      },
    },
    edges: { ...diagramSchema.properties.edges, minItems: 1, maxItems: 24 },
  },
};
export const parseDiagramExtension = (value: unknown): DiagramExtension => {
  const input = object(value, [
    "version",
    "title",
    "direction",
    "nodes",
    "edges",
  ]);
  if (
    !Array.isArray(input.nodes) ||
    !input.nodes.length ||
    input.nodes.length > 12 ||
    !Array.isArray(input.edges) ||
    !input.edges.length ||
    input.edges.length > 24
  ) {
    throw new Error("Invalid extension size");
  }
  const parsed = parseDiagram({
    ...input,
    nodes: [{ id: "s1", label: "Anchor", kind: "process" }, ...input.nodes],
  });
  const nodes = parsed.nodes.slice(1);
  if (nodes.some((node) => !/^n([1-9]|1[0-2])$/.test(node.id))) {
    throw new Error("Invalid extension alias");
  }
  const pairs = new Set<string>();
  const connected = new Set(["s1"]);
  for (const edge of parsed.edges) {
    const pair = `${edge.from}:${edge.to}`;
    if (edge.from === edge.to || pairs.has(pair)) {
      throw new Error("Invalid extension edge");
    }
    pairs.add(pair);
  }
  for (let i = 0; i <= nodes.length; i++) {
    for (const edge of parsed.edges) {
      if (connected.has(edge.from) || connected.has(edge.to)) {
        connected.add(edge.from);
        connected.add(edge.to);
      }
    }
  }
  if (nodes.some((node) => !connected.has(node.id))) {
    throw new Error("Disconnected extension");
  }
  return { ...parsed, nodes };
};
