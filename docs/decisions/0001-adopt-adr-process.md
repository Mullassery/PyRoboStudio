# ADR-0001: Adopt Architecture Decision Records

**Status:** Accepted · **Date:** 2026-10-31

## Context
Phase 1 requires recording decisions and rejected alternatives (master prompt §13 Phase 1). The competitive and library research produced several choices with real trade-offs and verification caveats.

## Decision
Record every architecture-relevant decision as a short ADR in `docs/decisions/` (context → decision → consequences → verification status). ADRs are immutable once Accepted; superseded by new ADRs, not edited.

## Consequences
- Rejected alternatives stay visible (why we did not fork Foxglove Studio, etc.).
- Each ADR carries a verification status so research follow-ups (the flagged items in `library-evaluation.md`) do not silently lapse.
