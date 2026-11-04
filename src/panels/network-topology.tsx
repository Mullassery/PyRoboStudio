import { useEffect, useMemo, useState } from "react";
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import ELK from "elkjs/lib/elk.bundled.js";
import { EmptyState, ErrorState } from "../components/status";

interface TopoNode {
  id: string;
  kind: "subnet" | "device" | "service";
  label: string;
  detail?: string;
}
interface TopoEdge {
  source: string;
  target: string;
  kind: string;
}
interface TopologyResponse {
  scanId: number;
  nodes: TopoNode[];
  edges: TopoEdge[];
  badge: string;
}

type TopoRfNode = Node<{ label: string; kind: TopoNode["kind"]; detail?: string }>;

const KIND_COLORS: Record<TopoNode["kind"], string> = {
  subnet: "var(--studio-accent)",
  device: "var(--studio-ok, var(--studio-accent))",
  service: "var(--studio-warn)",
};

function TopoNodeView(props: NodeProps) {
  const d = props.data as TopoRfNode["data"];
  return (
    <div
      className="rounded-md px-2.5 py-1 text-[11px]"
      data-testid={`topo-node-${d.kind}`}
      style={{
        background: "var(--studio-panel)",
        border: `1px solid ${KIND_COLORS[d.kind]}`,
        color: "var(--studio-text)",
      }}
    >
      {d.label}
      {d.detail ? <span className="ml-1 text-[9px] opacity-60">{d.detail}</span> : null}
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
  );
}

const nodeTypes = { topo: TopoNodeView };

async function fetchTopology(): Promise<TopologyResponse> {
  const res = await fetch("/api/repos/networkintel/topology");
  if (!res.ok) throw new Error(`topology unavailable (${res.status})`);
  return (await res.json()) as TopologyResponse;
}

function NetworkTopologyInner() {
  const [topo, setTopo] = useState<TopologyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nodes, setNodes] = useState<TopoRfNode[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const t = await fetchTopology();
        if (!cancelled) {
          setTopo(t);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const model = useMemo(() => {
    if (!topo) return null;
    const rfNodes: TopoRfNode[] = topo.nodes.map((n) => ({
      id: n.id,
      type: "topo",
      data: { label: n.label, kind: n.kind, detail: n.detail },
      position: { x: 0, y: 0 },
    }));
    const rfEdges: Edge[] = topo.edges.map((e, i) => ({
      id: `e${i}`,
      source: e.source,
      target: e.target,
      style: { stroke: "var(--studio-muted)" },
    }));
    return { rfNodes, rfEdges };
  }, [topo]);

  useEffect(() => {
    if (!model) return;
    let cancelled = false;
    const elk = new ELK();
    void elk
      .layout({
        id: "root",
        layoutOptions: {
          "elk.algorithm": "layered",
          "elk.direction": "RIGHT",
          "elk.layered.spacing.nodeNodeBetweenLayers": "80",
          "elk.spacing.nodeNode": "30",
        },
        children: model.rfNodes.map((n) => ({ id: n.id, width: 160, height: 28 })),
        edges: model.rfEdges.map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] })),
      })
      .then((result) => {
        if (cancelled) return;
        const pos = new Map<string, { x: number; y: number }>();
        for (const child of result.children ?? []) {
          pos.set(child.id, { x: child.x ?? 0, y: child.y ?? 0 });
        }
        setNodes(model.rfNodes.map((n) => ({ ...n, position: pos.get(n.id) ?? n.position })));
        setEdges(model.rfEdges);
      });
    return () => {
      cancelled = true;
    };
  }, [model]);

  if (error) return <ErrorState message={error} />;
  if (!topo) return <EmptyState label="Loading network topology…" />;

  return (
    <div className="relative h-full" data-testid="network-topology">
      <div
        className="absolute left-2 top-2 z-10 rounded px-2 py-0.5 text-[9px] uppercase"
        data-testid="topo-badge"
        style={{ background: "var(--studio-warn)", color: "var(--studio-bg)" }}
      >
        {topo.badge}
      </div>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        nodesDraggable
        nodesConnectable={false}
        proOptions={{ hideAttribution: true }}
        fitView
      >
        <Background />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}

export function NetworkTopologyPanel() {
  return (
    <ReactFlowProvider>
      <NetworkTopologyInner />
    </ReactFlowProvider>
  );
}
