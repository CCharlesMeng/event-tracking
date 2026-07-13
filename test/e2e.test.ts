import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { createTracker } from "../src/core/tracker";
import { wireTracker, type WiredSdk } from "../src/bootstrap";
import { EventAction } from "../src/core/event";
import type { InitConfig } from "../src/config";
import { fakePlatformContract } from "./helpers";

const furionContract = fakePlatformContract("report");
const uemContract = fakePlatformContract("track");

/**
 * End-to-end: real DOM click → delegator → recognizer → inference → tracker
 * pipeline (masking) → router → Furion + UEM adapters → fake platform
 * globals on window. Only the platform SDKs themselves are faked.
 */

type FakePlatform = { report: Mock; track: Mock };

let furionGlobal: FakePlatform;
let uemGlobal: FakePlatform;
let sdk: WiredSdk;

/** Payloads received through the test's explicit Furion `report` contract. */
const furionPayloads = (): Record<string, unknown>[] =>
  furionGlobal.report.mock.calls.map((call) => call[0] as Record<string, unknown>);

/** Payloads received through the test's explicit UEM `track` contract. */
const uemPayloads = (): Record<string, unknown>[] =>
  uemGlobal.track.mock.calls.map((call) => call[0] as Record<string, unknown>);

function initSdk(overrides: Partial<InitConfig> = {}): void {
  sdk = wireTracker(createTracker());
  sdk.init({
    businessType: "biz",
    serviceName: "orderService",
    platforms: {
      furion: { contract: furionContract },
      uem: { contract: uemContract },
    },
    ...overrides,
  });
}

beforeEach(() => {
  furionGlobal = { report: vi.fn(), track: vi.fn() };
  uemGlobal = { report: vi.fn(), track: vi.fn() };
  vi.stubGlobal("Furion", furionGlobal);
  vi.stubGlobal("UEM", uemGlobal);
  // Route the module segment (EC third part) is inferred from.
  history.replaceState(null, "", "/orders/orderList");
});

afterEach(() => {
  sdk?.destroy();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

/** The plan's validation scenario: order-list table, row action "导出". */
const ORDER_PAGE = `
<div class="card">
  <h3>订单列表</h3>
  <table>
    <thead>
      <tr><th>手机号</th><th>订单号</th><th>操作</th></tr>
    </thead>
    <tbody>
      <tr>
        <td>13800138000</td><td>SO20260708001</td>
        <td><button type="button">导出</button></td>
      </tr>
      <tr>
        <td>13900139000</td><td>SO20260708002</td>
        <td><button type="button">导出</button></td>
      </tr>
    </tbody>
  </table>
</div>`;

function clickExportOnRow(row: number): void {
  const button = document.querySelector(`tbody tr:nth-child(${row}) button`);
  if (!button) throw new Error("fixture button not found");
  button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
}

describe("e2e: 订单表格行点击「导出」自动采集", () => {
  it("fans the auto-captured event out to both platforms with full semantics and masked PII", () => {
    initSdk();
    document.body.innerHTML = ORDER_PAGE;

    clickExportOnRow(2);

    expect(furionPayloads()).toHaveLength(1);
    expect(uemPayloads()).toHaveLength(1);

    for (const payload of [furionPayloads()[0], uemPayloads()[0]]) {
      // EC = config(businessType) _ config(serviceName) _ infer(module from URL)
      expect(payload.eventCategory).toBe("biz_orderService_orderList");
      // 导出 maps to DOWNLOAD via the verb mapping
      expect(payload.eventType).toBe(EventAction.DOWNLOAD);
      // component + nearest-heading instance name + control text
      expect(payload.eventPath).toBe("Table.订单列表.导出");
      // row identity: current-page index + identifying-column text (phone → masked)
      expect(payload.eventCustom).toEqual({
        rowIndex: 1,
        rowLabel: "139****9000",
        buttonText: "导出",
      });
    }
  });

  it("only the configured platform receives events (single-platform init)", () => {
    initSdk({ platforms: { furion: { contract: furionContract } } });
    document.body.innerHTML = ORDER_PAGE;

    clickExportOnRow(1);

    expect(furionPayloads()).toHaveLength(1);
    expect(uemPayloads()).toHaveLength(0);
    expect(furionPayloads()[0].eventCustom).toEqual({
      rowIndex: 0,
      rowLabel: "138****8000",
      buttonText: "导出",
    });
  });

  it("destroy() stops auto-capture", () => {
    initSdk();
    document.body.innerHTML = ORDER_PAGE;

    sdk.destroy();
    clickExportOnRow(1);

    expect(furionPayloads()).toHaveLength(0);
    expect(uemPayloads()).toHaveLength(0);
  });
});

describe("e2e: 自定义 track()", () => {
  it("fans a manual event out to both platforms with the auto-composed EC", () => {
    const tracker = createTracker();
    sdk = wireTracker(tracker);
    sdk.init({
      businessType: "biz",
      serviceName: "orderService",
      platforms: {
        furion: { contract: furionContract },
        uem: { contract: uemContract },
      },
      autoTrack: false,
    });

    tracker.track({
      eventType: EventAction.CONFIRM,
      eventPath: "Modal.批量导出.确认",
      eventValue: "联系 13800138000",
    });

    expect(furionPayloads()).toHaveLength(1);
    expect(uemPayloads()).toHaveLength(1);
    for (const payload of [furionPayloads()[0], uemPayloads()[0]]) {
      expect(payload.eventCategory).toBe("biz_orderService_orderList");
      expect(payload.eventType).toBe(EventAction.CONFIRM);
      expect(payload.eventPath).toBe("Modal.批量导出.确认");
      // masking also covers manual events' eventValue
      expect(payload.eventValue).toBe("联系 138****8000");
    }
  });

  it("beforeReport returning null drops the event before any platform sees it", () => {
    const tracker = createTracker();
    sdk = wireTracker(tracker);
    sdk.init({
      businessType: "biz",
      serviceName: "orderService",
      platforms: {
        furion: { contract: furionContract },
        uem: { contract: uemContract },
      },
      autoTrack: false,
      beforeReport: (event) => (event.eventPath.startsWith("internal.") ? null : event),
    });

    tracker.track({ eventPath: "internal.调试按钮" });
    tracker.track({ eventPath: "Button.保存" });

    expect(furionPayloads().map((p) => p.eventPath)).toEqual(["Button.保存"]);
    expect(uemPayloads().map((p) => p.eventPath)).toEqual(["Button.保存"]);
  });
});
