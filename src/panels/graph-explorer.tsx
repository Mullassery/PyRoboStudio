import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BaseEdge,
  Controls,
  getSmoothStepPath,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  Handle,
  Position,
  useEdgesState,
  useNodesState,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import ELK from "elkjs/lib/elk.bundled.js";
import type { GraphSnapshot, PanelMountContextBase, SelectionRef } from "../sdk/contracts";
import { EmptyState, ErrorState } from "../components/status";
import { useWorkspace } from "../state/workspace";

type GraphViewKind = "node" | "topic" | "cluster";
type GraphRfData = { label: string; badge?: string; sel: boolean; kind: GraphViewKind };
type GraphRfNode = Node<GraphRfData>;

interface LayoutOptions {
  collapsed: boolean;
  filter: string;
  selected: SelectionRef | null;
}

function filterIds(sn: GraphSnapshot, q: string): Set<string> | null {
  if (!q) return null;
  const lower = q.toLowerCase();
  const keep = new Set<string>();
  for (const n of sn.nodes) {
    if (`${n.ns}/${n.name}`.toLowerCase().includes(lower)) keep.add(n.id);
  }
  for (const t of sn.topics) {
    if (t.name.toLowerCase().includes(lower) || t.msgType.toLowerCase().includes(lower)) {
      keep.add(t.id);
      for (const e of sn.edges.filter((x) => x.topicId === t.id)) keep.add(e.nodeId);
    }
  }
  return keep;
}

export function topicBadgeFor(sn: GraphSnapshot, topicId: string): string {
  const a = sn.activity.find((x) => x.topicId === topicId);
  if (!a) return "no flow";
  if (a.reliability === "unmeasured") return "unmeasured";
  if (a.reliability === "none") return "no flow";
  if (a.reliability === "observed" && a.hz !== undefined && a.hz > 0) return `${a.hz.toFixed(0)}Hz`;
  return "no flow";
}

export function buildGraphModel(
  sn: GraphSnapshot,
  opts: LayoutOptions,
): { nodes: GraphRfNode[]; edges: Edge[] } {
  const sel = opts.selected;
  const keep = filterIds(sn, opts.filter);

  const nodeItem = (n: GraphSnapshot["nodes"][number]): GraphRfNode => ({
    id: n.id,
    type: "rosnode",
    data: {
      label: `${n.ns === "/" ? "" : n.ns}/${n.name}`,
      sel: sel?.kind === "node" && sel.id === n.id,
      kind: "node",
    },
    position: { x: 0, y: 0 },
  });

  const topicItem = (t: GraphSnapshot["topics"][number]): GraphRfNode => ({
    id: t.id,
    type: "topic",
    data: {
      label: t.name,
      badge: topicBadgeFor(sn, t.id),
      sel: sel?.kind === "topic" && sel.id === t.id,
      kind: "topic",
    },
    position: { x: 0, y: 0 },
  });

  const kept = <T extends { id: string }>(items: T[]): T[] =>
    keep ? items.filter((x) => keep.has(x.id)) : items;

  if (opts.collapsed) {
    const nodes: GraphRfNode[] = [];
    const edges: Edge[] = [];
    const clusters = new Map<string, GraphSnapshot["nodes"]>();
    for (const n of kept(sn.nodes)) {
      const list = clusters.get(n.ns) ?? [];
      list.push(n);
      clusters.set(n.ns, list);
    }
    for (const [ns, members] of clusters) {
      const cid = `ns:${ns}`;
      nodes.push({
        id: cid,
        type: "cluster",
        data: {
          label: `${ns}* (${members.length})`,
          sel: members.some((m) => sel?.kind === "node" && sel.id === m.id),
          kind: "cluster",
        },
        position: { x: 0, y: 0 },
      });
      for (const m of members) {
        for (const e of sn.edges.filter((x) => x.nodeId === m.id)) {
          const topicIn = !keep || keep.has(e.topicId);
          if (!topicIn) continue;
          edges.push(
            e.direction === "pub"
              ? {
                  id: `up-${cid}-${e.topicId}`,
                  source: cid,
                  target: e.topicId,
                  type: "qosEdge",
                  data: { qosCompat: e.qosCompat, direction: "pub" },
                }
              : {
                  id: `down-${cid}-${e.topicId}`,
                  source: e.topicId,
                  target: cid,
                  type: "qosEdge",
                  data: { qosCompat: e.qosCompat, direction: "sub" },
                },
          );
        }
      }
    }
    for (const t of kept(sn.topics)) nodes.push(topicItem(t));
    const connected = new Set(edges.flatMap((e) => [e.source, e.target]));
    return { nodes: nodes.filter((n) => connected.has(n.id)), edges };
  }

  const nodes: GraphRfNode[] = [
    ...kept(sn.nodes).map(nodeItem),
    ...kept(sn.topics).map(topicItem),
  ];

  const edges: Edge[] = sn.edges
    .filter((e) => (!keep || (keep.has(e.nodeId) && keep.has(e.topicId))))
    .map((e) => ({
      id: e.id,
      source: e.direction === "pub" ? e.nodeId : e.topicId,
      target: e.direction === "pub" ? e.topicId : e.nodeId,
      type: "qosEdge",
      data: { qosCompat: e.qosCompat, direction: e.direction },
    }));

  return { nodes, edges };
}

export async function layoutGraph(nodes: GraphRfNode[], edges: Edge[]): Promise<GraphRfNode[]> {
  const elk = new ELK();
  const graph = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.layered.spacing.nodeNodeBetweenLayers": "70",
      "elk.spacing.nodeNode": "28",
    },
    children: nodes.map((n) => ({
      id: n.id,
      width: n.data.kind === "topic" ? 150 : 150,
      height: 28,
    })),
    edges: edges.map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] })),
  };
  const result = await elk.layout(graph);
  const pos = new Map<string, { x: number; y: number }>();
  for (const child of result.children ?? []) {
    pos.set(child.id, { x: child.x ?? 0, y: child.y ?? 0 });
  }
  return nodes.map((n) => ({ ...n, position: pos.get(n.id) ?? n.position }));
}

function posSig(nodes: GraphRfNode[]): string {
  return nodes.map((n) => `${n.id}@${n.position.x.toFixed(0)},${n.position.y.toFixed(0)}`).join("|");
}

function RosNodeView(props: NodeProps) {
  const d = props.data as GraphRfData;
  return (
    <div
      className="rounded-md px-2.5 py-1 text-[11px]"
      data-testid={`graph-node-${d.label.replace(/[^a-z0-9]+/gi, "-")}`}
      style={{
        background: "var(--studio-panel)",
        border: `1px solid ${d.sel ? "var(--studio-accent)" : "var(--studio-border)"}`,
        color: "var(--studio-text)",
      }}
    >
      {d.label}
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
  );
}

function TopicNodeView(props: NodeProps) {
  const d = props.data as GraphRfData;
  return (
    <div
      className="rounded-full px-2 py-0.5 font-mono text-[10px]"
      data-testid={`graph-topic-${d.label.replace(/[^a-z0-9]+/gi, "-")}`}
      style={{
        background: "color-mix(in oklch, var(--studio-accent) 20%, var(--studio-panel))",
        border: `1px solid ${d.sel ? "var(--studio-accent)" : "var(--studio-border)"}`,
        color: "var(--studio-text)",
      }}
    >
      <span className="inline-flex items-center gap-1">
        {d.label}
        {d.badge ? (
          <span
            className="rounded px-1 text-[8px] uppercase"
            data-testid="topic-activity-badge"
            style={{ background: "var(--studio-warn)", color: "var(--studio-bg)" }}
          >
            {d.badge}
          </span>
        ) : null}
      </span>
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
  );
}

function ClusterNodeView(props: NodeProps) {
  const d = props.data as GraphRfData;
  return (
    <div
      className="rounded-lg border border-dashed px-2.5 py-1 text-[11px]"
      style={{
        background: "color-mix(in oklch, var(--studio-muted) 12%, var(--studio-panel))",
        borderColor: d.sel ? "var(--studio-accent)" : "var(--studio-border)",
        color: "var(--studio-text)",
      }}
    >
      {d.label}
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
  );
}

function QosEdgeView(props: EdgeProps) {
  const data = (props.data ?? {}) as { qosCompat?: string; direction?: string };
  const compat = data.qosCompat ?? "unknown";
  const direction = data.direction ?? "pub";
  const stroke =
    compat === "incompatible"
      ? "var(--studio-err)"
      : compat === "unknown"
        ? "var(--studio-muted)"
        : "var(--studio-accent)";
  const [path] = getSmoothStepPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    sourcePosition: props.sourcePosition,
    targetX: props.targetX,
    targetY: props.targetY,
    targetPosition: props.targetPosition,
  });
  return (
    <BaseEdge
      id={props.id}
      path={path}
      style={{
        stroke,
        strokeWidth: 1.2,
        strokeDasharray: compat === "ok" ? undefined : "4 3",
        markerEnd: compat === "ok" ? undefined : undefined,
        ...(direction ? {} : {}),
      }}
    />
  );
}

const nodeTypes = { rosnode: RosNodeView, topic: TopicNodeView, cluster: ClusterNodeView };
const edgeTypes = { qosEdge: QosEdgeView };

function GraphExplorerInner({ ctx }: { ctx: PanelMountContextBase }) {
  const [snapshot, setSnapshot] = useState<GraphSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [selected, setSelected] = useState<SelectionRef | null>(ctx.selection.current());
  const theme = useWorkspace((s) => s.theme);
  const sourceId = useWorkspace((s) => s.sourceId);
  const [nodes, setNodes, onNodesChange] = useNodesState<GraphRfNode>([]);
  const [edges, , onEdgesChange] = useEdgesState<Edge>([]);
  const lastLayoutSig = useRef("");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const g = await ctx.source.mapper.graph();
        if (!cancelled) {
          setSnapshot(g);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    };
    void load();
    const poll = setInterval(load, 2000);
    ctx.cleanup.add(() => clearInterval(poll));
    return () => {
      cancelled = true;
    };
  }, [sourceId, ctx]);

  useEffect(() => {
    const off = ctx.selection.subscribe(setSelected);
    return off;
  }, [ctx]);

  const model = useMemo(() => {
    if (!snapshot) return null;
    return buildGraphModel(snapshot, { collapsed, filter, selected });
  }, [snapshot, collapsed, filter, selected]);

  useEffect(() => {
    if (!model) return;
    let cancelled = false;
    void layoutGraph(model.nodes, model.edges).then((positioned) => {
      if (cancelled) return;
      const sig = posSig(positioned);
      if (sig !== lastLayoutSig.current) {
        lastLayoutSig.current = sig;
        setNodes(positioned);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [model, setNodes]);

  const handleClick = useCallback(
    (viewKind: GraphViewKind, id: string, label: string) => {
      const kind: SelectionRef["kind"] = viewKind === "topic" ? "topic" : "node";
      const cur = ctx.selection.current();
      if (cur && cur.kind === kind && cur.id === id) {
        ctx.selection.publish(null);
        setSelected(null);
      } else {
        const ref: SelectionRef = { kind, sourceId: ctx.source.id, id, label };
        ctx.selection.publish(ref);
        setSelected(ref);
      }
    },
    [ctx],
  );

  if (error) return <ErrorState message={error} />;
  if (!snapshot) return <EmptyState label="Loading graph…" />;

  return (
    <div className="relative h-full" data-testid="graph-explorer">
      <div className="absolute right-2 top-2 z-10 flex items-center gap-2">
        <input
          className="w-44 rounded border border-border bg-panel px-2 py-1 text-xs outline-none"
          placeholder="Filter nodes/topics…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          data-testid="graph-filter-input"
        />
        <button
          className="rounded border border-border bg-panel px-2 py-1 text-xs"
          onClick={() => setCollapsed((c) => !c)}
          data-testid="graph-collapse-toggle"
        >
          {collapsed ? "Expand" : "Collapse namespaces"}
        </button>
      </div>
      <ReactFlow
        nodes={nodes.map((n) => n)}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
        proOptions={{ hideAttribution: true }}
        colorMode={theme === "dark" ? "dark" : "light"}
        fitView
        onNodeClick={(_, node) => {
          const nn = node as GraphRfNode;
          handleClick(nn.data.kind, nn.id, nn.data.label);
        }}
      >
        <Background />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable />
      </ReactFlow>
    </div>
  );
}

export function GraphExplorerPanel({ ctx }: { ctx: PanelMountContextBase }) {
  return (
    <ReactFlowProvider>
      <GraphExplorerInner ctx={ctx} />
    </ReactFlowProvider>
  );
}
