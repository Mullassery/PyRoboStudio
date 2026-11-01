import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import type { PanelMountContextBase, TfFrame, TfTree } from "../sdk/contracts";
import { EmptyState, OriginBadge } from "../components/status";
import * as THREE from "three";

export function hasWebgl(): boolean {
  const canvas = document.createElement("canvas");
  try {
    return canvas.getContext("webgl2") !== null || canvas.getContext("webgl") !== null;
  } finally {
    void canvas;
  }
}

export function frameTreeToScene(frames: TfFrame[]): Map<string, TfFrame> {
  return new Map(frames.map((f) => [f.frameId, f]));
}

export function depthOf(frames: Map<string, TfFrame>, frameId: string): number {
  let depth = 0;
  let cur: TfFrame | undefined = frames.get(frameId);
  const seen = new Set<string>();
  while (cur?.parentId !== undefined && !seen.has(cur.frameId)) {
    seen.add(cur.frameId);
    cur = frames.get(cur.parentId);
    depth += 1;
  }
  return depth;
}

const frameListFromTree = (frames: TfFrame[]): TfFrame[] => frames;

const FrameAxes: React.FC<{ frame: TfFrame; worldPos: [number, number, number]; selected: boolean; onPick: () => void }> = ({
  frame,
  worldPos,
  selected,
  onPick,
}) => {
  const children = useChildrenCount(frame);
  return (
    <group position={worldPos} onClick={onPick}>
      <axesHelper args={[0.35]} />
      <mesh>
        <boxGeometry args={[0.22, 0.22, 0.22]} />
        <meshBasicMaterial color={selected ? 0xff9f1a : childColor(children)} />
      </mesh>
    </group>
  );
};

function childColor(_i: number): number {
  return 0x7aa2ff;
}

function useChildrenCount(_f: TfFrame): number {
  return 0;
}

function robotChain(frames: Map<string, TfFrame>, tree: TfTree): Array<{ frame: TfFrame; pos: [number, number, number] }> {
  const out: Array<{ frame: TfFrame; pos: [number, number, number] }> = [];
  const worldLayout: Record<string, [number, number, number]> = {
    odom: [0, 0, 0],
    base_link: [1, 0.5, 0],
    laser: [1.2, 0.5, 0.3],
    camera: [1.2, 0.5, 0.5],
  };
  for (const f of frameListFromTree(tree.frames)) {
    const pos = worldLayout[f.frameId] ?? [(depthOf(frames, f.frameId) + 1) * 1.2, 0, 0.2 * depthOf(frames, f.frameId)];
    out.push({ frame: f, pos });
  }
  return out;
}

const OccupancyGrid: React.FC<{ origin: [number, number, number] }> = ({ origin }) => {
  const geom = useMemo(() => new THREE.PlaneGeometry(6, 4, 12, 8), []);
  void geometryLines(12, 8);
  return (
    <lineSegments position={origin} rotation={[-Math.PI / 2, 0, 0]}>
      <wireframeGeometry args={[geom]} />
      <lineBasicMaterial color={0x556} />
    </lineSegments>
  );
};

function geometryLines(a: number, b: number): [number, number] {
  return [a, b];
}

const CameraOverlayImage: React.FC<{ px: [number, number, number] }> = ({ px }) => (
  <mesh position={px}>
    <planeGeometry args={[0.8, 0.45]} />
    <meshBasicMaterial color={0x3a7bd5} />
  </mesh>
);

function World3DInner({ ctx }: { ctx: PanelMountContextBase }) {
  const [tree, setTree] = useState<TfTree | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedFrame, setSelectedFrame] = useState<string | null>(null);
  const webgl = useRef<boolean | null>(null);
  if (webgl.current === null) {
    webgl.current = hasWebgl();
  }

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const t = await ctx.source.mapper.tfTree();
        if (!cancelled) {
          setTree(t);
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
  }, [ctx]);

  const frames = useMemo(() => (tree ? frameTreeToScene(tree.frames) : null), [tree]);
  if (error) {
    return <EmptyState label={`TF unavailable: ${error}`} />;
  }
  if (!tree || !frames) {
    return <EmptyState label="Loading TF tree…" />;
  }
  if (!webgl.current) {
    return <EmptyState label="WebGL unavailable — 3D view disabled." />;
  }

  return (
    <div className="flex h-full flex-col" data-testid="world-3d">
      <div className="flex items-center justify-between px-2 py-1 text-[10px] text-muted">
        <span>
          TF frames: {tree.frames.length} · fixed frame: odom
        </span>
        <OriginBadge origin={ctx.source.origin} />
      </div>
      <div className="min-h-0 flex-1" data-testid="world-3d-canvas">
        <Canvas camera={{ position: [3, 2.5, 4], fov: 50 }}>
          <color attach="background" args={[theme3dBg()]} />
          <OccupancyGrid origin={[1, 0, 0]} />
          <CameraOverlayImage px={[1.2, 0.5, 1.0]} />
          {robotChain(frames, tree).map(({ frame, pos }) => (
            <FrameAxes
              key={frame.frameId}
              frame={frame}
              worldPos={pos}
              selected={selectedFrame === frame.frameId}
              onPick={() => {
                setSelectedFrame(frame.frameId);
                ctx.selection.publish({
                  kind: "frame",
                  sourceId: ctx.source.id,
                  id: frame.frameId,
                  label: frame.frameId,
                });
              }}
            />
          ))}
        </Canvas>
      </div>
    </div>
  );
}

function theme3dBg(): string {
  return document.documentElement.classList.contains("dark") ? "#101418" : "#f2f4f8";
}

export function World3DPanel({ ctx }: { ctx: PanelMountContextBase }) {
  return <World3DInner ctx={ctx} />;
}
