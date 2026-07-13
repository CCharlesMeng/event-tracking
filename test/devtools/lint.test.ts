import { describe, expect, it, vi } from "vitest";
import { createLintHook, lintEvent } from "../../src/devtools/lint";
import type { TrackEvent } from "../../src/core/event";

function validEvent(overrides: Partial<TrackEvent> = {}): TrackEvent {
  return {
    eventCategory: "biz_orderService_orderList",
    eventType: "CLICK",
    eventPath: "Table.订单列表.导出",
    ...overrides,
  };
}

describe("lintEvent: eventCategory rules", () => {
  it("accepts a clean 2-segment and 3-segment EC", () => {
    expect(lintEvent(validEvent({ eventCategory: "biz_orderService" }))).toEqual([]);
    expect(lintEvent(validEvent())).toEqual([]);
  });

  it("flags an empty EC", () => {
    const violations = lintEvent(validEvent({ eventCategory: "" }));
    expect(violations.some((v) => v.includes("eventCategory 为空"))).toBe(true);
  });

  it("flags a single-segment EC", () => {
    const violations = lintEvent(validEvent({ eventCategory: "biz" }));
    expect(violations.some((v) => v.includes("2-3 段"))).toBe(true);
  });

  it("flags more than 3 segments", () => {
    const violations = lintEvent(validEvent({ eventCategory: "a_b_c_d" }));
    expect(violations.some((v) => v.includes("2-3 段"))).toBe(true);
  });

  it("flags empty segments from doubled underscores", () => {
    const violations = lintEvent(validEvent({ eventCategory: "biz__orderList" }));
    expect(violations.some((v) => v.includes("空段"))).toBe(true);
  });

  it("flags segments that are not alphanumeric-starting-with-letter", () => {
    const violations = lintEvent(validEvent({ eventCategory: "biz_order-service" }));
    expect(violations.some((v) => v.includes("order-service"))).toBe(true);
    const numeric = lintEvent(validEvent({ eventCategory: "biz_1service" }));
    expect(numeric.some((v) => v.includes("1service"))).toBe(true);
  });
});

describe("lintEvent: eventType rules", () => {
  it("accepts every EventAction enum value silently", () => {
    expect(lintEvent(validEvent({ eventType: "DOWNLOAD" }))).toEqual([]);
    expect(lintEvent(validEvent({ eventType: "SUBMIT" }))).toEqual([]);
  });

  it("accepts the reserved SDK EXPOSE action", () => {
    const violations = lintEvent(validEvent({ eventType: "EXPOSE" }));
    expect(violations).toEqual([]);
  });

  it("rejects arbitrary custom eventType strings", () => {
    const violations = lintEvent(validEvent({ eventType: "CUSTOM" as never }));
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("封闭事件类型");
  });

  it("flags an empty eventType", () => {
    const violations = lintEvent(validEvent({ eventType: "" as never }));
    expect(violations.some((v) => v.includes("eventType 为空"))).toBe(true);
  });
});

describe("lintEvent: eventPath rules", () => {
  it("accepts component[.instance].control[:text] shapes", () => {
    expect(lintEvent(validEvent({ eventPath: "Button.保存" }))).toEqual([]);
    expect(lintEvent(validEvent({ eventPath: "Table.订单列表.导出:全部" }))).toEqual([]);
    expect(lintEvent(validEvent({ eventPath: "Modal" }))).toEqual([]);
  });

  it("flags an empty eventPath", () => {
    const violations = lintEvent(validEvent({ eventPath: "" }));
    expect(violations.some((v) => v.includes("eventPath 为空"))).toBe(true);
  });

  it("flags malformed paths with empty segments", () => {
    const violations = lintEvent(validEvent({ eventPath: "Table..导出" }));
    expect(violations.some((v) => v.includes("Table..导出"))).toBe(true);
    const trailing = lintEvent(validEvent({ eventPath: ".导出" }));
    expect(trailing.some((v) => v.includes(".导出"))).toBe(true);
  });
});

describe("lintEvent: eventCustom serializability", () => {
  it("accepts JSON-serializable eventCustom", () => {
    expect(lintEvent(validEvent({ eventCustom: { rowIndex: 3, label: "x" } }))).toEqual([]);
  });

  it("flags circular eventCustom", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const violations = lintEvent(validEvent({ eventCustom: circular }));
    expect(violations.some((v) => v.includes("JSON"))).toBe(true);
  });
});

describe("createLintHook", () => {
  it("console.warns each violation with the [event-tracking] prefix and passes the event through", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const hook = createLintHook();
    const event = validEvent({ eventCategory: "biz", eventType: "WEIRD" as never });
    const out = hook(event);
    expect(out).toBe(event); // never blocks / never modifies
    expect(warn).toHaveBeenCalledTimes(2);
    for (const call of warn.mock.calls) {
      expect(String(call[0])).toMatch(/^\[event-tracking\] lint: /);
    }
    warn.mockRestore();
  });

  it("stays silent for a clean event", () => {
    const messages: string[] = [];
    const hook = createLintHook({ warn: (m) => messages.push(m) });
    hook(validEvent());
    expect(messages).toEqual([]);
  });
});
