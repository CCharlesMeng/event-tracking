import { EventAction, validateTrackEvent, type TrackEvent } from "./event";
import { EventBuffer } from "./buffer";
import { ReportRouter } from "./router";
import type { ModuleInferrer, PipelineHook, PlatformAdapter } from "./ports";
import {
  resolveConfig,
  validateInitConfig,
  type InitConfig,
  type ResolvedConfig,
} from "../config";
import {
  LocalDiagnostics,
  type DiagnosticKind,
  type DiagnosticsSnapshot,
} from "./diagnostics";

/**
 * Facade holding the SDK state: config, adapter router, pre-init buffer
 * and the extension wiring points for later phases.
 *
 * === Wiring points for future modules (do not rename) ===
 * - `registerAdapter(adapter)`: src/adapters/furion.ts & uem.ts self-register
 *   here. Works before or after init(); the router owns readiness buffering.
 * - `use(hook)`: src/privacy/** (masking / field blacklist) and any event
 *   transformer plug in here. Return null from the hook to drop the event.
 * - `setModuleInferrer(fn)`: src/auto-tracking/inference.ts injects module inference for
 *   the auto-composed eventCategory.
 * - `onDispatch(listener)`: src/devtools/** observes every event that passed
 *   the pipeline (read-only tap, runs after beforeReport, before fan-out).
 * - src/auto-tracking/** (delegator/recognizers) simply calls `track(partialEvent)`.
 */
export class Tracker {
  private config: ResolvedConfig | null = null;
  private readonly diagnostics = new LocalDiagnostics();
  private readonly router = new ReportRouter(
    (message, error) => this.warn(message, error),
    (kind, reason, count) => this.recordDiagnostic(kind, reason, count),
  );
  /** track() calls made before init() are replayed right after init(). */
  private readonly preInitBuffer = new EventBuffer<Partial<TrackEvent>>();
  /** Adapters registered before init() wait here for the resolved config. */
  private pendingAdapters: PlatformAdapter[] = [];
  private hooks: PipelineHook[] = [];
  private moduleInferrer: ModuleInferrer = () => undefined;
  private dispatchListeners: Array<(event: TrackEvent) => void> = [];

  /** Initialize the SDK. Idempotent: repeated calls after the first are ignored. */
  init(config: InitConfig): void {
    try {
      if (this.config) {
        this.warn("init() called more than once; ignoring subsequent call");
        return;
      }
      const invalidReason = validateInitConfig(config);
      if (invalidReason) {
        this.recordDiagnostic("invalidConfigs", invalidReason);
        this.warn(`init() discarded invalid config: ${invalidReason}`);
        return;
      }
      this.config = resolveConfig(config);
      const adapters = this.pendingAdapters;
      this.pendingAdapters = [];
      for (const adapter of adapters) {
        this.router.register(adapter, this.config);
      }
      this.preInitBuffer.flush((partial) => this.track(partial));
    } catch (error) {
      this.recordDiagnostic("internalErrors", "init-internal-error");
      this.warn("init() failed", error);
    }
  }

  /**
   * Track an event. Accepts a partial: missing eventCategory is composed
   * as businessType_serviceName[_module]; missing eventType defaults to CLICK.
   */
  track(event: Partial<TrackEvent>): void {
    try {
      if (!this.config) {
        if (this.preInitBuffer.enqueue(event)) {
          this.recordDiagnostic("bufferOverflows", "pre-init-buffer-overflow");
          this.recordDiagnostic("droppedEvents", "pre-init-buffer-overflow");
        }
        return;
      }
      let normalized: TrackEvent | null = this.normalize(event, this.config);
      if (!this.accepts(normalized)) return;
      for (const hook of this.hooks) {
        if (normalized === null) return;
        normalized = hook(normalized);
      }
      if (normalized === null) {
        this.recordDiagnostic("droppedEvents", "pipeline-hook-drop");
        return;
      }
      if (this.config.beforeReport) {
        const result = this.config.beforeReport(normalized);
        if (result === null || result === false) {
          this.recordDiagnostic("droppedEvents", "before-report-drop");
          return;
        }
        normalized = result;
      }
      if (!this.accepts(normalized)) return;
      for (const listener of [...this.dispatchListeners]) {
        try {
          listener(normalized);
        } catch (error) {
          this.recordDiagnostic("internalErrors", "dispatch-listener-error");
          this.warn("dispatch listener threw", error);
        }
      }
      this.router.dispatch(normalized);
    } catch (error) {
      this.recordDiagnostic("internalErrors", "track-internal-error");
      this.recordDiagnostic("droppedEvents", "track-internal-error");
      this.warn("track() failed", error);
    }
  }

  /** Wiring point: platform adapters (furion/uem) register themselves here. */
  registerAdapter(adapter: PlatformAdapter): void {
    try {
      if (this.config) {
        this.router.register(adapter, this.config);
      } else {
        this.pendingAdapters.push(adapter);
      }
    } catch (error) {
      this.recordDiagnostic("internalErrors", "register-adapter-error");
      this.warn("registerAdapter() failed", error);
    }
  }

  /** Wiring point: privacy/masking & other event transformers plug in here. */
  use(hook: PipelineHook): void {
    this.hooks.push(hook);
  }

  /** Wiring point: auto-capture inference injects the module segment here. */
  setModuleInferrer(fn: ModuleInferrer): void {
    this.moduleInferrer = fn;
  }

  /** Wiring point: devtools panel taps the post-pipeline event stream here. */
  onDispatch(listener: (event: TrackEvent) => void): () => void {
    this.dispatchListeners.push(listener);
    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;
      const index = this.dispatchListeners.indexOf(listener);
      if (index >= 0) this.dispatchListeners.splice(index, 1);
    };
  }

  /** Resolved config, exposed for adapters/devtools. Null before init(). */
  getConfig(): ResolvedConfig | null {
    return this.config;
  }

  getDiagnostics(): DiagnosticsSnapshot {
    return this.diagnostics.snapshot();
  }

  /** Full teardown. A later init() starts a fresh run; track() meanwhile buffers. */
  destroy(): void {
    try {
      this.router.destroy();
      for (const adapter of this.pendingAdapters) {
        try {
          const result = adapter.teardown?.();
          if (result && typeof result.then === "function") {
            result.catch(() =>
              this.recordDiagnostic("internalErrors", "pending-adapter-teardown-error"),
            );
          }
        } catch {
          this.recordDiagnostic("internalErrors", "pending-adapter-teardown-error");
        }
      }
      this.pendingAdapters = [];
      const preInitDiscarded = this.preInitBuffer.clear();
      if (preInitDiscarded > 0) {
        this.recordDiagnostic("droppedEvents", "destroy-pre-init-buffer", preInitDiscarded);
      }
      this.hooks = [];
      this.moduleInferrer = () => undefined;
      this.dispatchListeners = [];
      this.config = null;
    } catch (error) {
      this.recordDiagnostic("internalErrors", "destroy-internal-error");
      this.warn("destroy() failed", error);
    }
  }

  recordDiagnostic(kind: DiagnosticKind, reason: string, count?: number): void {
    this.diagnostics.record(kind, reason, count);
  }

  private normalize(input: Partial<TrackEvent>, config: ResolvedConfig): TrackEvent {
    let eventCategory = input.eventCategory;
    if (!eventCategory) {
      let module: string | undefined;
      try {
        module = this.moduleInferrer();
      } catch (error) {
        this.recordDiagnostic("internalErrors", "module-inferrer-error");
        this.warn("module inferrer threw", error);
      }
      eventCategory = [config.businessType, config.serviceName, module]
        .filter((segment): segment is string => Boolean(segment))
        .join("_");
    }
    const normalized: TrackEvent = {
      eventCategory,
      eventType: input.eventType ?? EventAction.CLICK,
      eventPath: input.eventPath ?? "",
    };
    if (input.eventValue !== undefined) normalized.eventValue = input.eventValue;
    if (input.eventCustom !== undefined) normalized.eventCustom = input.eventCustom;
    return normalized;
  }

  private accepts(event: TrackEvent): boolean {
    const reason = validateTrackEvent(event);
    if (!reason) return true;
    this.recordDiagnostic("droppedEvents", reason);
    this.warn(`event discarded: ${reason}`);
    return false;
  }

  /** The SDK never throws into the host; in debug mode failures are logged. */
  private warn(message: string, error?: unknown): void {
    try {
      if (this.config?.debug && typeof console !== "undefined") {
        console.warn(`[event-tracking] ${message}`, error ?? "");
      }
    } catch {
      /* even logging must not throw */
    }
  }
}

/** Factory for isolated instances (used by tests; the public API uses a singleton). */
export function createTracker(): Tracker {
  return new Tracker();
}
