import type { SelectionRef } from "./contracts";

/**
 * Phase 5 spike (Gap 4, evaluation only, behind flag): SyncFleet-backed
 * annotation sync. Annotations are workspace selections + notes that would
 * replicate across nodes via the SyncFleet operation journal
 * (origin_node_id + origin_seq, causal metadata, last-write-wins policy with
 * explicit conflict surfacing). This module is the pure merge/conflict logic
 * only — no server wiring, no UI, no persistence yet.
 */

export interface Annotation {
  id: string;
  target: Pick<SelectionRef, "kind" | "id">;
  note: string;
  originNodeId: string;
  originSeq: number;
  createdAt: string;
}

export interface AnnotationConflict {
  annotationId: string;
  local: Annotation;
  remote: Annotation;
}

export const ANNOTATION_SYNC_FLAG = "annotationSync.enabled";

export function annotationsEnabled(config: Record<string, unknown>): boolean {
  return config[ANNOTATION_SYNC_FLAG] === true;
}

/**
 * Merge remote annotations into local state under SyncFleet's
 * last-write-wins-with-conflict-surfacing policy (mirrors the SyncFleet
 * journal's origin_seq semantics documented in adapter-schemas.md §6):
 * - higher originSeq wins
 * - equal seq on different origins = conflict, both kept, surfaced
 */
export function mergeAnnotations(
  local: Annotation[],
  remote: Annotation[],
): { merged: Annotation[]; conflicts: AnnotationConflict[] } {
  const byId = new Map<string, Annotation>();
  for (const a of local) byId.set(a.id, a);
  const conflicts: AnnotationConflict[] = [];
  for (const r of remote) {
    const l = byId.get(r.id);
    if (!l) {
      byId.set(r.id, r);
      continue;
    }
    if (r.originSeq > l.originSeq) {
      byId.set(r.id, r);
    } else if (r.originSeq === l.originSeq && l.originNodeId !== r.originNodeId) {
      conflicts.push({ annotationId: r.id, local: l, remote: r });
    }
  }
  return { merged: [...byId.values()], conflicts };
}
