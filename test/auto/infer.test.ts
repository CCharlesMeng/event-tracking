import { afterEach, describe, expect, it } from "vitest";
import {
  buildEventPath,
  inferInstanceName,
  inferModule,
} from "../../src/auto-tracking/inference";
import { $, mount, unmount, ORDER_TABLE_CARD } from "../fixtures/dom";

afterEach(() => {
  unmount();
  history.pushState({}, "", "/");
});

describe("inferModule (eventCategory module segment)", () => {
  it("uses the last meaningful URL path segment", () => {
    history.pushState({}, "", "/app/orderService/orders");
    expect(inferModule()).toBe("orders");
  });

  it("filters trailing id-like segments (numbers, uuids, long hex)", () => {
    history.pushState({}, "", "/app/orders/12345");
    expect(inferModule()).toBe("orders");
    history.pushState({}, "", "/app/orders/550e8400-e29b-41d4-a716-446655440000");
    expect(inferModule()).toBe("orders");
    history.pushState({}, "", "/app/orders/9f8e7d6c5b4a39281706fadb");
    expect(inferModule()).toBe("orders");
  });

  it("strips file extensions", () => {
    history.pushState({}, "", "/console/orderList.html");
    expect(inferModule()).toBe("orderList");
  });

  it("returns undefined when no segment is meaningful", () => {
    history.pushState({}, "", "/12345/");
    expect(inferModule()).toBeUndefined();
  });

  it("is overridden by [data-track-module] on the page", () => {
    history.pushState({}, "", "/app/orders");
    mount(`<div data-track-module="orderDetail"></div>`);
    expect(inferModule()).toBe("orderDetail");
  });
});

describe("inferInstanceName (eventPath instance segment)", () => {
  it("prefers data-track-name", () => {
    mount(`<table data-track-name="订单表"><tbody><tr><td><button id="b">导出</button></td></tr></tbody></table>`);
    expect(inferInstanceName($("#b"), "Table")).toBe("订单表");
  });

  it("uses the table caption when present", () => {
    mount(`<table><caption>退款列表</caption><tbody><tr><td><button id="b">导出</button></td></tr></tbody></table>`);
    expect(inferInstanceName($("#b"), "Table")).toBe("退款列表");
  });

  it("falls back to the nearest preceding heading", () => {
    mount(ORDER_TABLE_CARD);
    expect(inferInstanceName($("tbody button"), "Table")).toBe("订单列表");
  });

  it("falls back to the ordinal among same-kind components (Table2)", () => {
    mount(`
      <table><tbody><tr><td>a</td></tr></tbody></table>
      <table><tbody><tr><td><button id="b">导出</button></td></tr></tbody></table>
    `);
    expect(inferInstanceName($("#b"), "Table")).toBe("Table2");
  });

  it("returns empty string when nothing can be inferred", () => {
    mount(`<table><tbody><tr><td><button id="b">导出</button></td></tr></tbody></table>`);
    expect(inferInstanceName($("#b"), "Table")).toBe("");
  });
});

describe("buildEventPath", () => {
  it("assembles component[.instance].control[:text]", () => {
    expect(buildEventPath({ component: "Table", instanceName: "订单列表", controlText: "导出" })).toBe(
      "Table.订单列表.导出"
    );
    expect(
      buildEventPath({
        component: "Table",
        instanceName: "订单列表",
        control: "exportBtn",
        controlText: "导出",
      })
    ).toBe("Table.订单列表.exportBtn:导出");
    expect(buildEventPath({ component: "Form", controlText: "查询" })).toBe("Form.查询");
    expect(buildEventPath({ component: "Pagination" })).toBe("Pagination");
  });
});
