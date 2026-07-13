import type { TrackEvent } from "./event";
import type { PlatformAdapter } from "./ports";
import type { InitConfig } from "../config";
import { EventBuffer } from "./buffer";
import type { DiagnosticKind } from "./diagnostics";

export const DEDUPE_WINDOW_MS = 300;

interface AdapterEntry {
  adapter: PlatformAdapter;
  buffer: EventBuffer;
  unsubscribeReady: (() => void) | null;
}

/**
 * Report router: fans one event out to 1..N platform adapters.
 *
 * - Each adapter gets an independent readiness buffer. Async setup resolution
 *   or onReady actively flushes it; a later dispatch is only a fallback probe.
 * - A throwing adapter must never break the host page or the other
 *   adapters: setup/report/isReady calls are wrapped and failures are
 *   swallowed (counted locally and surfaced via `warn` only in debug mode).
 * - One 300ms fingerprint-based dedupe boundary owns all duplicate suppression.
 *   eventCustom participates through deterministic key ordering.
 */
export class ReportRouter {
  private entries: AdapterEntry[] = [];
  private recentFingerprints = new Map<string, number>();

  constructor(
    private readonly warn: (message: string, error?: unknown) => void = () => {},
    private readonly diagnose: (kind: DiagnosticKind, reason: string, count?: number) => void = () => {},
  ) {}

  /** Register an adapter and run its setup. Safe to call at any time. */
  register(adapter: PlatformAdapter, config: InitConfig): void {
    if (this.entries.some((entry) => entry.adapter.name === adapter.name)) {
      this.diagnose("duplicateAdapters", "duplicate-adapter");
      this.warn(`adapter "${adapter.name}" already registered; ignoring duplicate`);
      return;
    }
    const entry: AdapterEntry = { adapter, buffer: new EventBuffer(), unsubscribeReady: null };
    this.entries.push(entry);
    try {
      entry.unsubscribeReady = adapter.onReady?.(() => this.flushIfReady(entry)) ?? null;
    } catch (error) {
      this.recordInternal(`adapter "${adapter.name}" onReady subscription threw`, error);
    }
    try {
      const result = adapter.setup(config);
      if (result && typeof result.then === "function") {
        result.then(
          () => this.flushIfReady(entry),
          (error) => this.recordInternal(`adapter "${adapter.name}" setup rejected`, error),
        );
      }
    } catch (error) {
      this.recordInternal(`adapter "${adapter.name}" setup threw`, error);
    }
    this.flushIfReady(entry);
  }

  get adapterCount(): number {
    return this.entries.length;
  }

  dispatch(event: TrackEvent): void {
    if (this.isDuplicate(event)) {
      return;
    }
    for (const entry of this.entries) {
      this.dispatchTo(entry, event);
    }
  }

  private dispatchTo(entry: AdapterEntry, event: TrackEvent): void {
    const { adapter, buffer } = entry;
    let ready = false;
    try {
      ready = adapter.isReady();
    } catch (error) {
      this.recordInternal(`adapter "${adapter.name}" isReady threw`, error);
    }
    if (!ready) {
      this.diagnose("adapterNotReady", `adapter-not-ready:${adapter.name}`);
      if (buffer.enqueue(event)) {
        this.diagnose("bufferOverflows", `adapter-buffer-overflow:${adapter.name}`);
        this.diagnose("droppedEvents", `adapter-buffer-overflow:${adapter.name}`);
      }
      return;
    }
    if (buffer.size > 0) {
      buffer.flush((buffered) => this.reportSafely(adapter, buffered));
    }
    this.reportSafely(adapter, event);
  }

  private reportSafely(adapter: PlatformAdapter, event: TrackEvent): void {
    try {
      adapter.report(event);
    } catch (error) {
      this.recordInternal(`adapter "${adapter.name}" report threw`, error);
      this.diagnose("droppedEvents", `adapter-report-failed:${adapter.name}`);
    }
  }

  private isDuplicate(event: TrackEvent): boolean {
    let key: string | null;
    try {
      key = eventFingerprint(event);
    } catch {
      return false;
    }
    if (key === null) return false;
    const now = Date.now();
    const previous = this.recentFingerprints.get(key);
    const duplicate = previous !== undefined && now - previous < DEDUPE_WINDOW_MS;
    this.recentFingerprints.set(key, now);
    for (const [fingerprint, time] of this.recentFingerprints) {
      if (now - time >= DEDUPE_WINDOW_MS) this.recentFingerprints.delete(fingerprint);
    }
    if (duplicate) this.diagnose("droppedEvents", "duplicate-event");
    return duplicate;
  }

  private flushIfReady(entry: AdapterEntry): void {
    let ready = false;
    try {
      ready = entry.adapter.isReady();
    } catch (error) {
      this.recordInternal(`adapter "${entry.adapter.name}" isReady threw`, error);
    }
    if (ready && entry.buffer.size > 0) {
      entry.buffer.flush((event) => this.reportSafely(entry.adapter, event));
    }
  }

  /** Full lifecycle teardown. Buffered events are intentionally discarded. */
  destroy(): void {
    for (const entry of this.entries) {
      try {
        entry.unsubscribeReady?.();
      } catch (error) {
        this.recordInternal(`adapter "${entry.adapter.name}" readiness unsubscribe threw`, error);
      }
      const discarded = entry.buffer.clear();
      if (discarded > 0) {
        this.diagnose("droppedEvents", `destroy-buffer-discard:${entry.adapter.name}`, discarded);
      }
      try {
        const result = entry.adapter.teardown?.();
        if (result && typeof result.then === "function") {
          result.catch((error) =>
            this.recordInternal(`adapter "${entry.adapter.name}" teardown rejected`, error),
          );
        }
      } catch (error) {
        this.recordInternal(`adapter "${entry.adapter.name}" teardown threw`, error);
      }
    }
    this.entries = [];
    this.recentFingerprints.clear();
  }

  private recordInternal(message: string, error?: unknown): void {
    this.diagnose("internalErrors", "adapter-internal-error");
    this.warn(message, error);
  }
}

function eventFingerprint(event: TrackEvent): string | null {
  try {
    return stableSerialize([
      event.eventCategory,
      event.eventType,
      event.eventPath,
      event.eventValue ?? null,
      event.eventCustom ?? null,
    ]);
  } catch {
    return null;
  }
}

function stableSerialize(value: unknown): string {
  const stack = new WeakSet<object>();
  const normalize = (current: unknown): unknown => {
    if (current === null || typeof current !== "object") return current;
    if (stack.has(current)) throw new TypeError("circular value");
    stack.add(current);
    if (current instanceof Date) {
      stack.delete(current);
      return current.toJSON();
    }
    if (Array.isArray(current)) {
      const normalized = current.map(normalize);
      stack.delete(current);
      return normalized;
    }
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(current as Record<string, unknown>).sort()) {
      sorted[key] = normalize((current as Record<string, unknown>)[key]);
    }
    stack.delete(current);
    return sorted;
  };
  return JSON.stringify(normalize(value));
}
