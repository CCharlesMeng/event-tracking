import { afterEach, describe, expect, it, vi } from "vitest";
import { createTracker } from "../src/core/tracker";
import { wireTracker, type WiredSdk } from "../src/bootstrap";
import type { TrackEvent } from "../src/core/event";
import { fakePlatformContract } from "./helpers";

const furionContract = fakePlatformContract("report");
const uemContract = fakePlatformContract("track");

describe("wireTracker composition order", () => {
  let sdk: WiredSdk | undefined;

  afterEach(() => {
    sdk?.destroy();
    sdk = undefined;
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("wires adapter, privacy and inference before init replays buffered events", () => {
    const order: string[] = [];
    const reported: TrackEvent[] = [];
    vi.stubGlobal("Furion", {
      report(event: TrackEvent) {
        order.push("report");
        reported.push(event);
      },
    });
    history.replaceState(null, "", "/orders/orderList");

    const tracker = createTracker();
    tracker.onDispatch(() => order.push("dispatch"));
    tracker.track({
      eventPath: "Input.手机号",
      eventValue: "13800138000",
    });

    sdk = wireTracker(tracker);
    sdk.init({
      businessType: "biz",
      serviceName: "orderService",
      platforms: { furion: { contract: furionContract } },
      autoTrack: false,
      beforeReport(event) {
        order.push("beforeReport");
        expect(event).toMatchObject({
          eventCategory: "biz_orderService_orderList",
          eventValue: "138****8000",
        });
        return event;
      },
    });

    expect(order).toEqual(["beforeReport", "dispatch", "report"]);
    expect(reported).toHaveLength(1);
  });

  it("honours enabled=false and supports UEM-only wiring", () => {
    const furionReport = vi.fn();
    const uemTrack = vi.fn();
    vi.stubGlobal("Furion", { report: furionReport });
    vi.stubGlobal("UEM", { track: uemTrack });
    const tracker = createTracker();
    sdk = wireTracker(tracker);
    sdk.init({
      businessType: "biz",
      serviceName: "orders",
      autoTrack: false,
      platforms: {
        furion: { enabled: false, contract: furionContract },
        uem: { contract: uemContract },
      },
    });

    tracker.track({ eventPath: "Button.保存" });

    expect(furionReport).not.toHaveBeenCalled();
    expect(uemTrack).toHaveBeenCalledOnce();
  });

  it("wires debug panel and error-state observation, then tears both down", async () => {
    const report = vi.fn();
    vi.stubGlobal("Furion", { report });
    document.body.innerHTML = '<div class="ant-empty">暂无数据</div>';
    sdk = wireTracker(createTracker());
    sdk.init({
      businessType: "biz",
      serviceName: "orders",
      platforms: { furion: { contract: furionContract } },
      autoTrack: false,
      debug: true,
      trackErrorStates: true,
    });

    expect(document.querySelector("[data-event-tracking-devtools]")).not.toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 550));
    expect(report).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "EXPOSE", eventPath: "ErrorState.空态" }),
    );

    sdk.destroy();
    expect(document.querySelector("[data-event-tracking-devtools]")).toBeNull();
  });

  it("allows re-init after destroy without retaining first-run wiring", () => {
    const report = vi.fn();
    vi.stubGlobal("Furion", { report });
    history.replaceState(null, "", "/");
    const tracker = createTracker();
    sdk = wireTracker(tracker);
    sdk.init({
      businessType: "first",
      serviceName: "orders",
      platforms: { furion: { contract: furionContract } },
      autoTrack: false,
    });
    tracker.track({ eventPath: "Button.首轮" });
    sdk.destroy();

    sdk.init({
      businessType: "second",
      serviceName: "orders",
      platforms: { furion: { contract: furionContract } },
      autoTrack: false,
    });
    tracker.track({ eventPath: "Button.次轮" });

    expect(report.mock.calls.map((call) => call[0].eventCategory)).toEqual([
      "first_orders",
      "second_orders",
    ]);
  });
});
