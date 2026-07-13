import { describe, expect, expectTypeOf, it } from "vitest";
import * as sdk from "../src/index";
import type {
  InitConfig,
  DiagnosticsSnapshot,
  EventType,
  ModuleInferrer,
  PipelineHook,
  PlatformAdapter,
  PlatformConfig,
  PlatformReportContext,
  PlatformScriptConfig,
  PlatformSdkContract,
  PlatformSdkInstance,
  PlatformsConfig,
  RecognizedContext,
  Recognizer,
  RecognizerRegistration,
  RegisterRecognizerOptions,
  TrackEvent,
  Tracker,
  WiredSdk,
} from "../src/index";

const PUBLIC_RUNTIME_EXPORTS = [
  "EventAction",
  "EventBuffer",
  "ReportRouter",
  "SystemEventAction",
  "createTracker",
  "destroy",
  "getConfig",
  "getDiagnostics",
  "init",
  "onDispatch",
  "registerAdapter",
  "registerRecognizer",
  "setModuleInferrer",
  "track",
  "unregisterRecognizer",
  "use",
  "wireTracker",
];

describe("public entry contract", () => {
  it("keeps the complete runtime export set stable", () => {
    expect(Object.keys(sdk).sort()).toEqual(PUBLIC_RUNTIME_EXPORTS);
  });

  it("keeps the documented type exports available", () => {
    expectTypeOf<InitConfig>().toBeObject();
    expectTypeOf<DiagnosticsSnapshot>().toBeObject();
    expectTypeOf<EventType>().toBeString();
    expectTypeOf<PlatformConfig>().toBeObject();
    expectTypeOf<PlatformsConfig>().toBeObject();
    expectTypeOf<TrackEvent>().toBeObject();
    expectTypeOf<PlatformAdapter>().toBeObject();
    expectTypeOf<PlatformReportContext>().toBeObject();
    expectTypeOf<PlatformScriptConfig>().toBeObject();
    expectTypeOf<PlatformSdkContract>().toBeObject();
    expectTypeOf<PlatformSdkInstance>().toMatchTypeOf<
      Record<string, unknown> | ((...args: unknown[]) => unknown)
    >();
    expectTypeOf<RecognizedContext>().toBeObject();
    expectTypeOf<Recognizer>().toBeObject();
    expectTypeOf<RecognizerRegistration>().toBeObject();
    expectTypeOf<RegisterRecognizerOptions>().toBeObject();
    expectTypeOf<Tracker>().toBeObject();
    expectTypeOf<WiredSdk>().toBeObject();
    expectTypeOf<PipelineHook>().toBeFunction();
    expectTypeOf<ModuleInferrer>().toBeFunction();
  });
});
