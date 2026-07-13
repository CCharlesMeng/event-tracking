export type DiagnosticKind =
  | "droppedEvents"
  | "bufferOverflows"
  | "adapterNotReady"
  | "duplicateAdapters"
  | "internalErrors"
  | "invalidConfigs";

export interface DiagnosticsSnapshot {
  droppedEvents: number;
  bufferOverflows: number;
  adapterNotReady: number;
  duplicateAdapters: number;
  internalErrors: number;
  invalidConfigs: number;
  /** Aggregate-only reason counts; event payloads are never retained. */
  reasons: Readonly<Record<string, number>>;
}

/** Instance-local, in-memory diagnostics. It never performs network I/O. */
export class LocalDiagnostics {
  private counters: Record<DiagnosticKind, number> = {
    droppedEvents: 0,
    bufferOverflows: 0,
    adapterNotReady: 0,
    duplicateAdapters: 0,
    internalErrors: 0,
    invalidConfigs: 0,
  };
  private reasons: Record<string, number> = {};

  record(kind: DiagnosticKind, reason: string, count = 1): void {
    if (!Number.isFinite(count) || count <= 0) return;
    this.counters[kind] += count;
    this.reasons[reason] = (this.reasons[reason] ?? 0) + count;
  }

  snapshot(): DiagnosticsSnapshot {
    return {
      ...this.counters,
      reasons: { ...this.reasons },
    };
  }
}
