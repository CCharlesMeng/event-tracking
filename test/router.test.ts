import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReportRouter } from "../src/core/router";
import type { TrackEvent } from "../src/core/event";
import { fakeAdapter } from "./helpers";

const config = { businessType: "biz", serviceName: "svc" };

function event(
  path: string,
  value?: string,
  eventCustom?: Record<string, unknown>,
): TrackEvent {
  const e: TrackEvent = { eventCategory: "biz_svc", eventType: "CLICK", eventPath: path };
  if (value !== undefined) e.eventValue = value;
  if (eventCustom !== undefined) e.eventCustom = eventCustom;
  return e;
}

describe("ReportRouter", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("fans out one event to all registered adapters", () => {
    const router = new ReportRouter();
    const a = fakeAdapter("furion");
    const b = fakeAdapter("uem");
    router.register(a, config);
    router.register(b, config);

    router.dispatch(event("Button.保存"));

    expect(a.reported).toHaveLength(1);
    expect(b.reported).toHaveLength(1);
    expect(a.setupConfig).toEqual(config);
  });

  it("buffers per adapter while not ready and flushes in order once ready", () => {
    const router = new ReportRouter();
    const ready = fakeAdapter("furion", true);
    const slow = fakeAdapter("uem", false);
    router.register(ready, config);
    router.register(slow, config);

    router.dispatch(event("a"));
    vi.advanceTimersByTime(150);
    router.dispatch(event("b"));

    expect(ready.reported.map((e) => e.eventPath)).toEqual(["a", "b"]);
    expect(slow.reported).toHaveLength(0);

    slow.ready = true;
    vi.advanceTimersByTime(150);
    router.dispatch(event("c"));
    expect(slow.reported.map((e) => e.eventPath)).toEqual(["a", "b", "c"]);
  });

  it("actively flushes when async setup becomes ready without another event", async () => {
    const router = new ReportRouter();
    const slow = fakeAdapter("uem", false);
    let finishSetup: (() => void) | undefined;
    slow.setup = () =>
      new Promise<void>((resolve) => {
        finishSetup = resolve;
      });
    router.register(slow, config);
    router.dispatch(event("buffered"));

    slow.ready = true;
    finishSetup?.();
    await Promise.resolve();

    expect(slow.reported.map((item) => item.eventPath)).toEqual(["buffered"]);
  });

  it("swallows a throwing adapter without blocking the others", () => {
    const router = new ReportRouter();
    const broken = fakeAdapter("furion");
    broken.report = () => {
      throw new Error("platform exploded");
    };
    const healthy = fakeAdapter("uem");
    router.register(broken, config);
    router.register(healthy, config);

    expect(() => router.dispatch(event("x"))).not.toThrow();
    expect(healthy.reported).toHaveLength(1);
  });

  it("swallows setup errors (sync throw and async rejection)", async () => {
    const warn = vi.fn();
    const router = new ReportRouter(warn);
    const throws = fakeAdapter("furion");
    throws.setup = () => {
      throw new Error("sync setup fail");
    };
    const rejects = fakeAdapter("uem");
    rejects.setup = () => Promise.reject(new Error("async setup fail"));

    expect(() => {
      router.register(throws, config);
      router.register(rejects, config);
    }).not.toThrow();
    await vi.runAllTimersAsync();
    expect(warn).toHaveBeenCalledTimes(2);

    router.dispatch(event("still-works"));
    expect(throws.reported).toHaveLength(1);
    expect(rejects.reported).toHaveLength(1);
  });

  it("dedupes an identical fingerprint within 300ms but keeps distinct ones", () => {
    const router = new ReportRouter();
    const a = fakeAdapter("furion");
    router.register(a, config);

    router.dispatch(event("Button.保存"));
    router.dispatch(event("Button.保存")); // duplicate inside the window
    router.dispatch(event("Button.取消")); // different path passes
    expect(a.reported.map((e) => e.eventPath)).toEqual(["Button.保存", "Button.取消"]);

    vi.advanceTimersByTime(301);
    router.dispatch(event("Button.取消")); // same again, but outside the window
    expect(a.reported).toHaveLength(3);
  });

  it("includes eventCustom with stable key ordering in the fingerprint", () => {
    const router = new ReportRouter();
    const adapter = fakeAdapter("furion");
    router.register(adapter, config);

    router.dispatch(event("Button.保存", undefined, { row: 1, label: "a" }));
    router.dispatch(event("Button.保存", undefined, { label: "a", row: 1 }));
    router.dispatch(event("Button.保存", undefined, { row: 2, label: "a" }));

    expect(adapter.reported).toHaveLength(2);
    expect(adapter.reported[1].eventCustom).toEqual({ row: 2, label: "a" });
  });

  it("rejects duplicate adapter names and diagnoses buffer overflow", () => {
    const diagnose = vi.fn();
    const router = new ReportRouter(vi.fn(), diagnose);
    const slow = fakeAdapter("uem", false);
    router.register(slow, config);
    router.register(fakeAdapter("uem"), config);
    for (let index = 0; index < 201; index += 1) {
      router.dispatch(event(`Button.${index}`));
    }

    expect(router.adapterCount).toBe(1);
    expect(diagnose).toHaveBeenCalledWith("duplicateAdapters", "duplicate-adapter");
    expect(diagnose).toHaveBeenCalledWith(
      "bufferOverflows",
      "adapter-buffer-overflow:uem",
    );
  });

  it("tears down adapters and discards readiness buffers on destroy", () => {
    const router = new ReportRouter();
    const adapter = fakeAdapter("uem", false);
    const teardown = vi.fn();
    adapter.teardown = teardown;
    router.register(adapter, config);
    router.dispatch(event("buffered"));

    router.destroy();

    expect(teardown).toHaveBeenCalledOnce();
    expect(router.adapterCount).toBe(0);
  });
});
