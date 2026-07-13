import { describe, expect, it } from "vitest";
import { EventAction, SystemEventAction } from "../src/core/event";
import type { TrackEvent } from "../src/core/event";

describe("EventAction", () => {
  it("contains exactly the 22 agreed actions", () => {
    const expected = [
      "INIT", "CLICK", "SEARCH", "ON", "OFF", "SELECT", "CHECK", "UNCHECK",
      "REFRESH", "BLUR", "DOWNLOAD", "BATCH", "HOVER", "SLIDE", "ADD",
      "REDUCE", "DRAG", "CHANGE", "SUBMIT", "FOCUS", "UPLOAD", "CONFIRM",
    ];
    expect(Object.keys(EventAction)).toEqual(expected);
    expect(Object.keys(EventAction)).toHaveLength(22);
  });

  it("string enum values mirror their keys (stable wire format)", () => {
    for (const [key, value] of Object.entries(EventAction)) {
      expect(value).toBe(key);
    }
  });

  it("keeps EXPOSE separate as the only SDK system action", () => {
    expect(SystemEventAction).toEqual({ EXPOSE: "EXPOSE" });
    expect(Object.values(EventAction)).not.toContain("EXPOSE");
  });
});

describe("TrackEvent model", () => {
  it("accepts the full field set", () => {
    const event: TrackEvent = {
      eventCategory: "biz_orderService_orderList",
      eventType: EventAction.DOWNLOAD,
      eventPath: "Table.订单列表.导出",
      eventValue: "2026-07",
      eventCustom: { rowIndex: 3, rowLabel: "SO20260708001" },
    };
    expect(event.eventType).toBe("DOWNLOAD");
  });
});
