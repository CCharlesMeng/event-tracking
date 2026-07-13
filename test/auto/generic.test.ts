import { afterEach, describe, expect, it } from "vitest";
import { EventAction } from "../../src/core/event";
import { genericDomRecognizer } from "../../src/auto-tracking/recognizers/generic-dom";
import {
  $,
  mount,
  unmount,
  ORDER_TABLE_CARD,
  OVERRIDDEN_TABLE,
  PAGINATION_FIXTURE,
  SEARCH_FORM,
  PLAIN_FORM,
  SWITCH_FIXTURE,
  CHECKBOX_FIXTURE,
  RADIO_FIXTURE,
  SELECT_FIXTURE,
  TABS_FIXTURE,
} from "../fixtures/dom";

afterEach(unmount);

const recognize = (el: Element) => genericDomRecognizer.recognize(el);

describe("generic recognizer: table rows", () => {
  it("recognizes a row action button with rowIndex and default rowLabel", () => {
    mount(ORDER_TABLE_CARD);
    const exportBtn = $("tbody tr:nth-child(2) button");
    const ctx = recognize(exportBtn);
    expect(ctx).toMatchObject({
      component: "Table",
      controlText: "导出",
      row: { rowIndex: 1, rowLabel: "SO20260708002" },
    });
    expect(ctx?.action).toBeUndefined();
  });

  it("skips pure-button cells when picking the default rowLabel", () => {
    mount(`
      <table><tbody>
        <tr>
          <td><a>编辑</a></td>
          <td>MAT-001</td>
          <td><button type="button">删除</button></td>
        </tr>
      </tbody></table>
    `);
    const ctx = recognize($("tbody button"));
    expect(ctx?.row).toEqual({ rowIndex: 0, rowLabel: "MAT-001" });
  });

  it("honours data-track-row-label as a header name", () => {
    mount(OVERRIDDEN_TABLE);
    const ctx = recognize($("tbody button"));
    expect(ctx?.row).toEqual({ rowIndex: 0, rowLabel: "100" });
  });

  it("honours data-track-row-label as a 0-based column index", () => {
    mount(OVERRIDDEN_TABLE);
    $("table").setAttribute("data-track-row-label", "1");
    const ctx = recognize($("tbody button"));
    expect(ctx?.row?.rowLabel).toBe("100");
  });

  it("applies data-track-name / data-track-control overrides", () => {
    mount(OVERRIDDEN_TABLE);
    const ctx = recognize($("tbody button"));
    expect(ctx?.instanceName).toBe("订单表");
    expect(ctx?.control).toBe("exportBtn");
    expect(ctx?.controlText).toBe("导出");
  });

  it("gives no row context for clicks outside tbody rows", () => {
    mount(`<table><thead><tr><th><button type="button">全选</button></th></tr></thead></table>`);
    const ctx = recognize($("thead button"));
    expect(ctx?.component).toBe("Table");
    expect(ctx?.row).toBeUndefined();
  });
});

describe("generic recognizer: forms", () => {
  it("recognizes a search form as SEARCH", () => {
    mount(SEARCH_FORM);
    const ctx = recognize($("form"));
    expect(ctx).toMatchObject({
      component: "Form",
      action: EventAction.SEARCH,
      controlText: "查询",
    });
  });

  it("recognizes a plain form as SUBMIT", () => {
    mount(PLAIN_FORM);
    const ctx = recognize($("form"));
    expect(ctx).toMatchObject({ component: "Form", action: EventAction.SUBMIT });
  });
});

describe("generic recognizer: form controls", () => {
  it("recognizes a switch-like checkbox as Switch ON/OFF from its new state", () => {
    mount(SWITCH_FIXTURE);
    const input = $("input") as HTMLInputElement;
    input.checked = true;
    expect(recognize(input)).toMatchObject({
      component: "Switch",
      action: EventAction.ON,
      controlText: "自动同步",
    });
    input.checked = false;
    expect(recognize(input)?.action).toBe(EventAction.OFF);
  });

  it("recognizes role=switch from its pre-toggle aria state", () => {
    mount(`<button type="button" role="switch" aria-checked="false" aria-label="夜间模式"></button>`);
    expect(recognize($("[role=switch]"))).toMatchObject({
      component: "Switch",
      action: EventAction.ON,
      controlText: "夜间模式",
    });
  });

  it("recognizes plain checkboxes as CHECK/UNCHECK", () => {
    mount(CHECKBOX_FIXTURE);
    const input = $("input") as HTMLInputElement;
    input.checked = true;
    expect(recognize(input)).toMatchObject({
      component: "Checkbox",
      action: EventAction.CHECK,
      controlText: "接收通知",
    });
    input.checked = false;
    expect(recognize(input)?.action).toBe(EventAction.UNCHECK);
  });

  it("recognizes radio as SELECT without reading its value", () => {
    mount(RADIO_FIXTURE);
    expect(recognize($("input"))).toMatchObject({
      component: "Radio",
      action: EventAction.SELECT,
      controlText: "快递",
    });
  });

  it("recognizes select as SELECT", () => {
    mount(SELECT_FIXTURE);
    expect(recognize($("select"))).toMatchObject({
      component: "Select",
      action: EventAction.SELECT,
      controlText: "状态",
    });
  });
});

describe("generic recognizer: tabs / menu / pagination / buttons", () => {
  it("recognizes role=tab as Tabs SELECT", () => {
    mount(TABS_FIXTURE);
    expect(recognize($('[role="tab"]:nth-child(2)'))).toMatchObject({
      component: "Tabs",
      action: EventAction.SELECT,
      controlText: "待发货",
    });
  });

  it("recognizes role=menuitem as Menu without a forced action", () => {
    mount(`<ul role="menu"><li role="menuitem">导出数据</li></ul>`);
    const ctx = recognize($('[role="menuitem"]'));
    expect(ctx?.component).toBe("Menu");
    expect(ctx?.controlText).toBe("导出数据");
    expect(ctx?.action).toBeUndefined();
  });

  it("recognizes pagination items as Pagination CLICK", () => {
    mount(PAGINATION_FIXTURE);
    expect(recognize($("li:nth-child(2) a"))).toMatchObject({
      component: "Pagination",
      action: EventAction.CLICK,
      controlText: "2",
    });
  });

  it("falls back to Button for standalone buttons and links", () => {
    mount(`<button type="button">新建</button>`);
    expect(recognize($("button"))).toMatchObject({ component: "Button", controlText: "新建" });
  });

  it("returns null for unrecognizable targets", () => {
    mount(`<div id="plain">文本</div>`);
    expect(recognize($("#plain"))).toBeNull();
  });
});
