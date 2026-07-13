import { describe, expect, it, vi } from "vitest";
import { createTracker } from "../src/core/tracker";
import { EventAction, type TrackEvent } from "../src/core/event";
import type { InitConfig } from "../src/config";
import { fakeAdapter } from "./helpers";

const baseConfig = { businessType: "biz", serviceName: "orderService" };

function setup(config: Partial<InitConfig> = {}) {
  const tracker = createTracker();
  const adapter = fakeAdapter("furion");
  tracker.registerAdapter(adapter);
  tracker.init({ ...baseConfig, ...config });
  return { tracker, adapter };
}

describe("Tracker: eventCategory auto-composition", () => {
  it("composes businessType_serviceName when eventCategory is omitted", () => {
    const { tracker, adapter } = setup();
    tracker.track({ eventType: EventAction.CLICK, eventPath: "Button.保存" });
    expect(adapter.reported[0].eventCategory).toBe("biz_orderService");
  });

  it("appends the module segment from the injectable inferrer", () => {
    const { tracker, adapter } = setup();
    tracker.setModuleInferrer(() => "orderList");
    tracker.track({ eventPath: "Table.订单列表.导出", eventType: EventAction.DOWNLOAD });
    expect(adapter.reported[0].eventCategory).toBe("biz_orderService_orderList");
  });

  it("keeps an explicitly provided eventCategory untouched", () => {
    const { tracker, adapter } = setup();
    tracker.setModuleInferrer(() => "ignored");
    tracker.track({ eventCategory: "custom_ec", eventPath: "x" });
    expect(adapter.reported[0].eventCategory).toBe("custom_ec");
  });

  it("defaults eventType to CLICK for partial events", () => {
    const { tracker, adapter } = setup();
    tracker.track({ eventPath: "Button.保存" });
    expect(adapter.reported[0].eventType).toBe("CLICK");
  });

  it("survives a throwing module inferrer", () => {
    const { tracker, adapter } = setup();
    tracker.setModuleInferrer(() => {
      throw new Error("router not ready");
    });
    expect(() => tracker.track({ eventPath: "x" })).not.toThrow();
    expect(adapter.reported[0].eventCategory).toBe("biz_orderService");
  });
});

describe("Tracker: pre-init buffering", () => {
  it("buffers track() calls before init() and replays them after", () => {
    const tracker = createTracker();
    const adapter = fakeAdapter("furion");
    tracker.registerAdapter(adapter);

    tracker.track({ eventPath: "early-1" });
    tracker.track({ eventPath: "early-2", eventCategory: "explicit_ec" });
    expect(adapter.reported).toHaveLength(0);

    tracker.init(baseConfig);
    expect(adapter.reported.map((e) => e.eventPath)).toEqual(["early-1", "early-2"]);
    // Normalization happens at replay time, with the now-known config.
    expect(adapter.reported[0].eventCategory).toBe("biz_orderService");
    expect(adapter.reported[1].eventCategory).toBe("explicit_ec");
  });

  it("ignores a second init() call", () => {
    const { tracker, adapter } = setup();
    tracker.init({ businessType: "other", serviceName: "other" });
    tracker.track({ eventPath: "x" });
    expect(adapter.reported[0].eventCategory).toBe("biz_orderService");
  });
});

describe("Tracker: runtime contracts and diagnostics", () => {
  it("silently rejects invalid config and events with aggregate reasons", () => {
    const tracker = createTracker();
    const adapter = fakeAdapter("furion");
    tracker.registerAdapter(adapter);

    expect(() =>
      tracker.init({ businessType: "bad-value", serviceName: "orders" }),
    ).not.toThrow();
    expect(tracker.getConfig()).toBeNull();
    tracker.init(baseConfig);
    tracker.track({ eventPath: "" });
    tracker.track({
      eventType: "CUSTOM" as never,
      eventPath: "Button.保存",
    });

    expect(adapter.reported).toHaveLength(0);
    expect(tracker.getDiagnostics()).toMatchObject({
      invalidConfigs: 1,
      droppedEvents: 2,
    });
    expect(tracker.getDiagnostics().reasons).toMatchObject({
      "invalid-business-type": 1,
      "invalid-event-path": 1,
      "invalid-event-type": 1,
    });
  });

  it("reports pre-init overflow without retaining event payloads", () => {
    const tracker = createTracker();
    for (let index = 0; index < 201; index += 1) {
      tracker.track({ eventPath: `Button.${index}` });
    }
    expect(tracker.getDiagnostics()).toMatchObject({
      bufferOverflows: 1,
      droppedEvents: 1,
    });
  });
});

describe("Tracker: beforeReport and pipeline hooks", () => {
  it("drops the event when beforeReport returns null or false", () => {
    const dropped: string[] = [];
    const { tracker, adapter } = setup({
      beforeReport: (event: TrackEvent) => {
        if (event.eventPath.startsWith("secret")) {
          dropped.push(event.eventPath);
          return null;
        }
        return event;
      },
    });
    tracker.track({ eventPath: "secret.表单" });
    tracker.track({ eventPath: "public.按钮" });
    expect(dropped).toEqual(["secret.表单"]);
    expect(adapter.reported.map((e) => e.eventPath)).toEqual(["public.按钮"]);
  });

  it("applies beforeReport's returned (modified) event", () => {
    const { tracker, adapter } = setup({
      beforeReport: (event: TrackEvent) => ({ ...event, eventValue: "masked" }),
    });
    tracker.track({ eventPath: "Input.手机号", eventValue: "13800138000" });
    expect(adapter.reported[0].eventValue).toBe("masked");
  });

  it("runs use() hooks before beforeReport and supports dropping via null", () => {
    const order: string[] = [];
    const { tracker, adapter } = setup({
      beforeReport: (event: TrackEvent) => {
        order.push("beforeReport");
        return event;
      },
    });
    tracker.use((event) => {
      order.push("hook");
      if (event.eventPath === "drop-me") return null;
      return { ...event, eventCustom: { ...event.eventCustom, masked: true } };
    });

    tracker.track({ eventPath: "drop-me" });
    tracker.track({ eventPath: "keep-me" });

    expect(order).toEqual(["hook", "hook", "beforeReport"]);
    expect(adapter.reported).toHaveLength(1);
    expect(adapter.reported[0].eventCustom).toEqual({ masked: true });
  });
});

describe("Tracker: silence and wiring points", () => {
  it("never throws into the host, even when everything is broken", () => {
    const tracker = createTracker();
    const broken = fakeAdapter("furion");
    broken.setup = () => {
      throw new Error("setup boom");
    };
    broken.report = () => {
      throw new Error("report boom");
    };
    tracker.registerAdapter(broken);
    expect(() => {
      tracker.init({
        ...baseConfig,
        beforeReport: () => {
          throw new Error("hook boom");
        },
      });
      tracker.track({ eventPath: "x" });
    }).not.toThrow();
  });

  it("warns via console.warn only in debug mode", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const silent = createTracker();
    silent.init(baseConfig);
    silent.init(baseConfig); // double init triggers a warn path
    expect(warn).not.toHaveBeenCalled();

    const debug = createTracker();
    debug.init({ ...baseConfig, debug: true });
    debug.init(baseConfig);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it("registers adapters after init() too", () => {
    const { tracker } = setup();
    const late = fakeAdapter("uem");
    tracker.registerAdapter(late);
    tracker.track({ eventPath: "x" });
    expect(late.reported).toHaveLength(1);
    expect(late.setupConfig?.businessType).toBe("biz");
  });

  it("exposes the post-pipeline stream to onDispatch (devtools tap)", () => {
    const { tracker, adapter } = setup({ beforeReport: () => null });
    const seen: string[] = [];
    tracker.onDispatch((event) => seen.push(event.eventPath));
    tracker.track({ eventPath: "dropped-by-beforeReport" });
    expect(seen).toEqual([]);
    expect(adapter.reported).toHaveLength(0);
  });

  it("onDispatch returns an idempotent unsubscribe", () => {
    const { tracker } = setup();
    const seen: string[] = [];
    const unsubscribe = tracker.onDispatch((event) => seen.push(event.eventPath));
    tracker.track({ eventPath: "Button.一" });
    unsubscribe();
    unsubscribe();
    tracker.track({ eventPath: "Button.二" });
    expect(seen).toEqual(["Button.一"]);
  });
});

describe("Tracker: destroy and re-init", () => {
  it("fully tears down and treats track after destroy as pre-init input", () => {
    const tracker = createTracker();
    const first = fakeAdapter("furion");
    const teardown = vi.fn();
    first.teardown = teardown;
    tracker.registerAdapter(first);
    tracker.use((event) => ({ ...event, eventValue: "first-run-hook" }));
    tracker.init(baseConfig);
    tracker.track({ eventPath: "Button.首轮" });

    tracker.destroy();
    tracker.track({ eventPath: "Button.重启期间" });
    const second = fakeAdapter("furion");
    tracker.registerAdapter(second);
    tracker.init({ businessType: "next", serviceName: "orders" });

    expect(teardown).toHaveBeenCalledOnce();
    expect(tracker.getConfig()?.businessType).toBe("next");
    expect(second.reported).toHaveLength(1);
    expect(second.reported[0]).toMatchObject({
      eventCategory: "next_orders",
      eventPath: "Button.重启期间",
    });
    expect(second.reported[0].eventValue).toBeUndefined();
    expect(first.reported).toHaveLength(1);
  });
});
