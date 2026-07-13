import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { EventAction, type TrackEvent } from "../../src/core/event";
import {
  startAutoTrack,
  type AutoTrackHandle,
} from "../../src/auto-tracking/delegator";
import {
  registerRecognizer,
  unregisterRecognizer,
} from "../../src/auto-tracking/recognizers/registry";
import {
  $,
  change,
  click,
  mount,
  submit,
  unmount,
  IGNORED_SUBTREE,
  ORDER_TABLE_CARD,
  OVERRIDDEN_TABLE,
  PAGINATION_FIXTURE,
  PLAIN_FORM,
  SEARCH_FORM,
  RADIO_FIXTURE,
  SELECT_FIXTURE,
  SWITCH_FIXTURE,
  TABS_FIXTURE,
} from "../fixtures/dom";

let track: Mock<(event: Partial<TrackEvent>) => void>;
let handle: AutoTrackHandle;

beforeEach(() => {
  track = vi.fn();
  handle = startAutoTrack({ track });
});

afterEach(() => {
  handle.stop();
  unmount();
});

const lastEvent = (): Partial<TrackEvent> => {
  expect(track).toHaveBeenCalled();
  return track.mock.calls[track.mock.calls.length - 1][0];
};

describe("scenario: 订单表格行点击「导出」", () => {
  it("produces Table component, heading instance name, DOWNLOAD and row context", () => {
    mount(ORDER_TABLE_CARD);
    click($("tbody tr:nth-child(2) button"));
    expect(track).toHaveBeenCalledTimes(1);
    expect(lastEvent()).toEqual({
      eventType: EventAction.DOWNLOAD,
      eventPath: "Table.订单列表.导出",
      eventCustom: { rowIndex: 1, rowLabel: "SO20260708002", buttonText: "导出" },
    });
  });

  it("unmapped row action text (删除) conservatively falls back to CLICK", () => {
    mount(ORDER_TABLE_CARD);
    click($("tbody tr:nth-child(1) button:nth-child(2)"));
    const event = lastEvent();
    expect(event.eventType).toBe(EventAction.CLICK);
    expect(event.eventPath).toBe("Table.订单列表.删除");
    expect(event.eventCustom).toMatchObject({ rowIndex: 0, rowLabel: "SO20260708001" });
  });
});

describe("data-track-* overrides", () => {
  it("data-track-name / data-track-control / data-track-row-label win over inference", () => {
    mount(OVERRIDDEN_TABLE);
    click($("tbody button"));
    expect(lastEvent()).toEqual({
      eventType: EventAction.DOWNLOAD,
      eventPath: "Table.订单表.exportBtn:导出",
      eventCustom: { rowIndex: 0, rowLabel: "100", buttonText: "导出" },
    });
  });

  it("data-track-ignore skips the whole subtree", () => {
    mount(IGNORED_SUBTREE);
    click($("button"));
    expect(track).not.toHaveBeenCalled();
  });
});

describe("form submit", () => {
  it("search form submit yields SEARCH with the search term as eventValue", () => {
    mount(SEARCH_FORM);
    ($("input") as HTMLInputElement).value = " 手机壳 ";
    submit($("form"));
    expect(lastEvent()).toEqual({
      eventType: EventAction.SEARCH,
      eventPath: "Form.查询",
      eventValue: "手机壳",
      eventCustom: { buttonText: "查询" },
    });
  });

  it("plain form submit yields SUBMIT and never captures input values", () => {
    mount(PLAIN_FORM);
    ($("input") as HTMLInputElement).value = "内部备注";
    submit($("form"));
    const event = lastEvent();
    expect(event.eventType).toBe(EventAction.SUBMIT);
    expect(event.eventValue).toBeUndefined();
  });

  it("clicking the submit button does not double-report (submit handler owns it)", () => {
    mount(SEARCH_FORM);
    const button = $("button");
    button.addEventListener("click", (event) => event.preventDefault());
    click(button);
    expect(track).not.toHaveBeenCalled();
    submit($("form"));
    expect(track).toHaveBeenCalledTimes(1);
    expect(lastEvent().eventType).toBe(EventAction.SEARCH);
  });
});

describe("change interactions", () => {
  it("switch change reports ON then OFF", () => {
    mount(SWITCH_FIXTURE);
    const input = $("input") as HTMLInputElement;
    input.checked = true;
    change(input);
    expect(lastEvent()).toMatchObject({ eventType: EventAction.ON, eventPath: "Switch.自动同步" });
    input.checked = false;
    change(input);
    expect(lastEvent()).toMatchObject({ eventType: EventAction.OFF });
    expect(track).toHaveBeenCalledTimes(2);
  });

  it("text input change is out of scope (privacy)", () => {
    mount(`<input type="text" value="secret" />`);
    change($("input"));
    expect(track).not.toHaveBeenCalled();
  });

  it("radio and select changes use semantic actions without capturing values", () => {
    mount(`${RADIO_FIXTURE}${SELECT_FIXTURE}`);
    change($('input[type="radio"]'));
    expect(lastEvent()).toMatchObject({
      eventType: EventAction.SELECT,
      eventPath: "Radio.快递",
    });
    expect(lastEvent().eventValue).toBeUndefined();

    change($("select"));
    expect(lastEvent()).toMatchObject({
      eventType: EventAction.SELECT,
      eventPath: "Select.状态",
    });
    expect(lastEvent().eventValue).toBeUndefined();
  });
});

describe("pagination and tabs", () => {
  it("pagination item click reports Pagination + CLICK", () => {
    mount(PAGINATION_FIXTURE);
    click($("li:nth-child(2) a"));
    expect(lastEvent()).toMatchObject({
      eventType: EventAction.CLICK,
      eventPath: "Pagination.2",
    });
  });

  it("tab click reports Tabs + SELECT", () => {
    mount(TABS_FIXTURE);
    click($('[role="tab"]:nth-child(2)'));
    expect(lastEvent()).toMatchObject({
      eventType: EventAction.SELECT,
      eventPath: "Tabs.待发货",
    });
  });
});

describe("engine behaviour", () => {
  it("leaves duplicate suppression to the router", () => {
    mount(ORDER_TABLE_CARD);
    const button = $("tbody button");
    click(button);
    click(button);
    expect(track).toHaveBeenCalledTimes(2);
  });

  it("registered recognizers take priority over the generic fallback", () => {
    registerRecognizer({
      name: "acme-ui",
      recognize: (target) =>
        target.closest(".acme-btn") ? { component: "AcmeButton", controlText: "导出" } : null,
    });
    try {
      mount(`<button type="button" class="acme-btn">导出</button>`);
      click($("button"));
      expect(lastEvent().eventPath).toBe("AcmeButton.导出");
    } finally {
      unregisterRecognizer("acme-ui");
    }
  });

  it("a throwing recognizer is skipped silently and generic still answers", () => {
    registerRecognizer({
      name: "broken",
      recognize: () => {
        throw new Error("boom");
      },
    });
    try {
      mount(`<button type="button">新建</button>`);
      click($("button"));
      expect(lastEvent().eventPath).toBe("Button.新建");
    } finally {
      unregisterRecognizer("broken");
    }
  });

  it("a throwing track callback never breaks the page", () => {
    track.mockImplementation(() => {
      throw new Error("report failed");
    });
    mount(`<button type="button">新建</button>`);
    expect(() => click($("button"))).not.toThrow();
  });

  it("the instance handle detaches all listeners", () => {
    mount(`<button type="button">新建</button>`);
    handle.stop();
    click($("button"));
    expect(track).not.toHaveBeenCalled();
  });

  it("isolates concurrent roots and stopping one does not affect the other", () => {
    handle.stop();
    document.body.innerHTML =
      '<div id="a"><button type="button">新建</button></div>' +
      '<div id="b"><button type="button">保存</button></div>';
    const a = document.getElementById("a")!;
    const b = document.getElementById("b")!;
    const trackA = vi.fn();
    const trackB = vi.fn();
    const handleA = startAutoTrack({ root: a, track: trackA });
    const handleB = startAutoTrack({ root: b, track: trackB });

    (a.querySelector("button") as HTMLElement).click();
    (b.querySelector("button") as HTMLElement).click();
    expect(trackA).toHaveBeenCalledTimes(1);
    expect(trackB).toHaveBeenCalledTimes(1);

    handleA.stop();
    (b.querySelector("button") as HTMLElement).click();
    expect(trackB).toHaveBeenCalledTimes(2);
    handleB.stop();
  });

  it("supports a ShadowRoot as an isolated custom root", () => {
    handle.stop();
    const host = document.createElement("div");
    const outside = document.createElement("button");
    outside.textContent = "外部";
    document.body.append(host, outside);
    const shadow = host.attachShadow({ mode: "open" });
    const inside = document.createElement("button");
    inside.textContent = "保存";
    shadow.appendChild(inside);
    const shadowTrack = vi.fn();
    const shadowHandle = startAutoTrack({ root: shadow, track: shadowTrack });

    click(outside);
    click(inside);

    expect(shadowTrack).toHaveBeenCalledOnce();
    expect(shadowTrack.mock.calls[0]![0]).toMatchObject({
      eventType: EventAction.SUBMIT,
      eventPath: "Button.保存",
    });
    shadowHandle.stop();
  });
});
