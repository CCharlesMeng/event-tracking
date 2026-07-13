import { describe, expect, it } from "vitest";
import { resolveConfig, validateInitConfig } from "../src/config";

describe("resolveConfig", () => {
  it("applies the conservative public defaults", () => {
    expect(resolveConfig({ businessType: "biz", serviceName: "orders" })).toEqual({
      businessType: "biz",
      serviceName: "orders",
      autoTrack: true,
      debug: false,
      fieldBlacklist: [],
      trackErrorStates: false,
    });
  });

  it("preserves explicitly configured values and integration options", () => {
    const beforeReport = (event: Parameters<NonNullable<
      ReturnType<typeof resolveConfig>["beforeReport"]
    >>[0]) => event;
    const config = {
      businessType: "biz",
      serviceName: "orders",
      platforms: { furion: { enabled: false, globalName: "CustomFurion" } },
      autoTrack: false,
      debug: true,
      fieldBlacklist: ["phone"],
      trackErrorStates: true,
      beforeReport,
    };

    expect(resolveConfig(config)).toEqual(config);
  });
});

describe("validateInitConfig", () => {
  it("accepts identifier segments and returns stable reasons for invalid input", () => {
    expect(validateInitConfig({ businessType: "biz2", serviceName: "orderService" })).toBeNull();
    expect(validateInitConfig({ businessType: "", serviceName: "orders" })).toBe(
      "invalid-business-type",
    );
    expect(validateInitConfig({ businessType: "biz", serviceName: "order-service" })).toBe(
      "invalid-service-name",
    );
  });
});
