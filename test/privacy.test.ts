import { describe, expect, it, vi } from "vitest";
import { createMaskHook, maskText } from "../src/privacy/mask";
import type { TrackEvent } from "../src/core/event";

function baseEvent(overrides: Partial<TrackEvent> = {}): TrackEvent {
  return {
    eventCategory: "biz_orderService",
    eventType: "CLICK",
    eventPath: "Button.保存",
    ...overrides,
  };
}

describe("maskText: built-in PII regexes", () => {
  it("masks CN mobile phones keeping first 3 and last 4", () => {
    expect(maskText("13812345678")).toBe("138****5678");
    expect(maskText("联系电话：15987654321。")).toBe("联系电话：159****4321。");
  });

  it("does not mask 11-digit runs that are not phones", () => {
    expect(maskText("12345678901")).toBe("12345678901");
  });

  it("masks 18-digit ID cards (including trailing X) keeping first 3 and last 4", () => {
    expect(maskText("110101199003074512")).toBe("110***********4512");
    expect(maskText("11010119900307451X")).toBe("110***********451X");
  });

  it("masks 15-digit ID cards via the generic digit-run rule", () => {
    expect(maskText("110101900307451")).toBe("110********7451");
  });

  it("masks 13-19 digit bank card numbers keeping first 3 and last 4", () => {
    expect(maskText("6222020200112233")).toBe("622*********2233");
    expect(maskText("6222020200112233445")).toBe("622************3445"); // 19 digits
  });

  it("leaves short digit runs untouched", () => {
    expect(maskText("订单号 123456789012")).toBe("订单号 123456789012"); // 12 digits
  });

  it("masks email local parts to their first char", () => {
    expect(maskText("alice@example.com")).toBe("a***@example.com");
    expect(maskText("a@x.com")).toBe("a***@x.com");
  });

  it("masks multiple PII kinds in one text", () => {
    expect(maskText("手机13812345678 邮箱bob@x.com")).toBe("手机138****5678 邮箱b***@x.com");
  });

  it("leaves plain text untouched", () => {
    expect(maskText("导出订单列表")).toBe("导出订单列表");
  });
});

describe("createMaskHook: deep traversal", () => {
  it("masks DOM-derived text inside eventPath", () => {
    const hook = createMaskHook();
    const out = hook(baseEvent({ eventPath: "Table.用户13812345678.导出" }));
    expect(out?.eventPath).toBe("Table.用户138****5678.导出");
  });

  it("masks a string eventValue", () => {
    const hook = createMaskHook();
    const out = hook(baseEvent({ eventValue: "13812345678" }));
    expect(out?.eventValue).toBe("138****5678");
  });

  it("keeps numeric eventValue untouched", () => {
    const hook = createMaskHook();
    const out = hook(baseEvent({ eventValue: 42 }));
    expect(out?.eventValue).toBe(42);
  });

  it("recursively masks strings in nested objects and arrays of eventCustom", () => {
    const hook = createMaskHook();
    const out = hook(
      baseEvent({
        eventCustom: {
          rowLabel: "13812345678",
          nested: { email: "carol@corp.cn", count: 3 },
          list: ["110101199003074512", 7, { deep: "dave@x.io" }],
        },
      }),
    );
    expect(out?.eventCustom).toEqual({
      rowLabel: "138****5678",
      nested: { email: "c***@corp.cn", count: 3 },
      list: ["110***********4512", 7, { deep: "d***@x.io" }],
    });
  });

  it("does not mutate the original event", () => {
    const hook = createMaskHook();
    const custom = { phone: "13812345678" };
    const event = baseEvent({ eventCustom: custom });
    hook(event);
    expect(custom.phone).toBe("13812345678");
    expect(event.eventCustom).toBe(custom);
  });
});

describe("createMaskHook: field blacklist", () => {
  it("replaces blacklisted eventCustom fields wholesale with ***", () => {
    const hook = createMaskHook({ fieldBlacklist: ["idNumber", "salary"] });
    const out = hook(
      baseEvent({
        eventCustom: { idNumber: { raw: "whatever" }, salary: 99999, keep: "ok" },
      }),
    );
    expect(out?.eventCustom).toEqual({ idNumber: "***", salary: "***", keep: "ok" });
  });

  it("matches blacklisted fields at any depth", () => {
    const hook = createMaskHook({ fieldBlacklist: ["token"] });
    const out = hook(baseEvent({ eventCustom: { outer: { token: "abc", other: 1 } } }));
    expect(out?.eventCustom).toEqual({ outer: { token: "***", other: 1 } });
  });

  it("passes events through unchanged when there is nothing to mask", () => {
    const hook = createMaskHook({ fieldBlacklist: [] });
    const event = baseEvent();
    expect(hook(event)).toEqual(event);
  });

  it("safely cuts circular references without mutating the source", () => {
    const hook = createMaskHook();
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const out = hook(baseEvent({ eventCustom: circular }));
    expect(out).not.toBeNull();
    expect(out?.eventPath).toBe("Button.保存");
  });

  it("drops the event on unexpected masking failure instead of leaking raw data", () => {
    const onError = vi.fn();
    const hook = createMaskHook({ onError });
    const broken = new Proxy(baseEvent({ eventPath: "Button.13812345678" }), {
      ownKeys() {
        throw new Error("hostile proxy");
      },
    });

    expect(hook(broken)).toBeNull();
    expect(onError).toHaveBeenCalledOnce();
  });
});
