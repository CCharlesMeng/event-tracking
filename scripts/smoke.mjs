/**
 * Smoke test for the built IIFE bundle: loads dist/event-tracking.v<version>.js
 * in a bare `node vm` sandbox (no DOM at all) and verifies that the global
 * EventTracking API works and fans a manual event out to a fake platform.
 * Usage: node scripts/smoke.mjs
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const { version } = require("../package.json");
const bundle = readFileSync(new URL(`../dist/event-tracking.v${version}.js`, import.meta.url), "utf8");

const reported = [];
const sandbox = { console, Date, Furion: { report: (payload) => reported.push(payload) } };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(bundle, sandbox);

const assert = (condition, message) => {
  if (!condition) {
    console.error(`SMOKE FAIL: ${message}`);
    process.exit(1);
  }
};

const ET = sandbox.EventTracking;
assert(ET, "global EventTracking missing");
const expectedExports = [
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
assert(
  JSON.stringify(Object.keys(ET).sort()) === JSON.stringify(expectedExports),
  `unexpected EventTracking exports: ${Object.keys(ET).sort().join(", ")}`
);
assert(typeof ET.init === "function", "EventTracking.init is not a function");
assert(typeof ET.track === "function", "EventTracking.track is not a function");
assert(typeof ET.destroy === "function", "EventTracking.destroy is not a function");
assert(ET.EventAction && ET.EventAction.CLICK === "CLICK", "EventAction enum missing");
assert(
  ET.SystemEventAction && ET.SystemEventAction.EXPOSE === "EXPOSE",
  "SystemEventAction enum missing"
);
const furionContract = {
  isReady: (instance) => typeof instance.report === "function",
  report(instance, event) {
    instance.report(event);
  },
};
const registration = ET.registerRecognizer({
  name: "smoke-fixture",
  recognize: () => null,
});
assert(registration.registered === true, "recognizer registration failed");
assert(registration.unregister() === true, "recognizer unregistration failed");

// No document in this sandbox: init must survive (auto-capture silently skips).
ET.init({
  businessType: "biz",
  serviceName: "orderService",
  platforms: { furion: { contract: furionContract } },
});
ET.track({ eventType: ET.EventAction.CLICK, eventPath: "Button.保存", eventValue: "13800138000" });

assert(reported.length === 1, `expected 1 reported event, got ${reported.length}`);
const event = reported[0];
assert(event.eventCategory === "biz_orderService", `unexpected EC: ${event.eventCategory}`);
assert(event.eventType === "CLICK", `unexpected ET: ${event.eventType}`);
assert(event.eventPath === "Button.保存", `unexpected EP: ${event.eventPath}`);
assert(event.eventValue === "138****8000", `phone not masked: ${event.eventValue}`);

ET.destroy();
ET.track({ eventPath: "Button.重启期间" });
ET.init({
  businessType: "next",
  serviceName: "orders",
  platforms: { furion: { contract: furionContract } },
});
assert(reported.length === 2, "destroy/re-init did not replay the buffered event");
assert(reported[1].eventCategory === "next_orders", "re-init retained stale config");
assert(typeof ET.getDiagnostics().droppedEvents === "number", "diagnostics unavailable");
ET.destroy();

const esm = await import(new URL(`../dist/event-tracking.esm.js?smoke=${Date.now()}`, import.meta.url));
assert(
  JSON.stringify(Object.keys(esm).sort()) === JSON.stringify(expectedExports),
  `unexpected ESM exports: ${Object.keys(esm).sort().join(", ")}`
);
const esmReported = [];
esm.registerAdapter({
  name: "esm-smoke",
  setup() {},
  isReady: () => true,
  report: (event) => esmReported.push(event),
});
esm.init({ businessType: "esm", serviceName: "smoke", autoTrack: false });
esm.track({ eventType: esm.EventAction.CONFIRM, eventPath: "Button.ESM" });
assert(esmReported.length === 1, "ESM adapter did not receive the event");
assert(esmReported[0].eventCategory === "esm_smoke", "ESM event category mismatch");
esm.destroy();

console.log(
  `SMOKE OK: IIFE + ESM v${version} — API, lifecycle, contract, masking and diagnostics verified`
);
