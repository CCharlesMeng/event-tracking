/**
 * Public entry. The IIFE build mounts this module's exports on the global
 * `EventTracking` object (see tsup.config.ts), so host pages use:
 *
 *   EventTracking.init({ businessType: "biz", serviceName: "orderService" });
 *   EventTracking.track({ eventType: EventTracking.EventAction.CLICK, eventPath: "..." });
 */
import { createTracker } from "./core/tracker";
import { wireTracker } from "./bootstrap";
import {
  registerRecognizer,
  unregisterRecognizer,
} from "./auto-tracking/recognizers/registry";

const tracker = createTracker();
const wired = wireTracker(tracker);

/** init + config-driven wiring (adapters, privacy, auto-capture, devtools). */
export const init = wired.init;
/** Fully tears down the current run; a later init() is supported. */
export const destroy = wired.destroy;
/** Stable manual event-reporting API. */
export const track = tracker.track.bind(tracker);
/** Extension API: register a custom reporting platform. */
export const registerAdapter = tracker.registerAdapter.bind(tracker);
/** Extension API: add an event pipeline hook. */
export const use = tracker.use.bind(tracker);
/** Extension API: replace module inference. */
export const setModuleInferrer = tracker.setModuleInferrer.bind(tracker);
/** Extension API: observe post-pipeline dispatches. */
export const onDispatch = tracker.onDispatch.bind(tracker);
/** Extension API: inspect the resolved init config. */
export const getConfig = tracker.getConfig.bind(tracker);
/** Local aggregate diagnostics; no event payloads or network reporting. */
export const getDiagnostics = tracker.getDiagnostics.bind(tracker);
/** Extension API: register a prioritized component-library recognizer. */
export { registerRecognizer, unregisterRecognizer };

// Stable API
export { EventAction, SystemEventAction } from "./core/event";
export type { EventType, TrackEvent } from "./core/event";
export type { InitConfig, PlatformConfig, PlatformsConfig } from "./config";
export type { DiagnosticsSnapshot } from "./core/diagnostics";

// Extension API
export type {
  ModuleInferrer,
  PipelineHook,
  PlatformAdapter,
  PlatformReportContext,
  PlatformScriptConfig,
  PlatformScriptReferrerPolicy,
  PlatformSdkContract,
  PlatformSdkInstance,
} from "./core/ports";
export type { Tracker } from "./core/tracker";
export type {
  RecognizedContext,
  RecognizedRow,
  Recognizer,
  RecognizerRegistration,
  RegisterRecognizerOptions,
} from "./auto-tracking/recognizers/registry";

// Compatibility API: retained in round one; prefer the stable singleton API.
/** @deprecated Internal composition API; prefer init/track/destroy. */
export { wireTracker } from "./bootstrap";
/** @deprecated Internal composition type; prefer InitConfig and the stable singleton API. */
export type { WiredSdk } from "./bootstrap";
/** @deprecated Internal factory; prefer the package singleton API. */
export { createTracker } from "./core/tracker";
/** @deprecated Internal buffering implementation; not part of the stable API. */
export { EventBuffer } from "./core/buffer";
/** @deprecated Internal routing implementation; register adapters through registerAdapter. */
export { ReportRouter } from "./core/router";
