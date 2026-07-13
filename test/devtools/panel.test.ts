import { afterEach, describe, expect, it } from "vitest";
import { mountDebugPanel, type DebugPanelHandle } from "../../src/devtools/panel";
import type { TrackEvent } from "../../src/core/event";

function makeEvent(overrides: Partial<TrackEvent> = {}): TrackEvent {
  return {
    eventCategory: "biz_orderService",
    eventType: "CLICK",
    eventPath: "Button.保存",
    ...overrides,
  };
}

function panelRoot(): HTMLElement | null {
  return document.querySelector("[data-event-tracking-devtools]");
}

function panelList(): HTMLElement | null {
  return document.querySelector("[data-event-tracking-list]");
}

describe("mountDebugPanel", () => {
  let handle: DebugPanelHandle | null = null;

  afterEach(() => {
    handle?.unmount();
    handle = null;
    document.body.innerHTML = "";
  });

  it("mounts a fixed bottom-right panel into document.body", () => {
    handle = mountDebugPanel({ subscribe: () => {} });
    const root = panelRoot();
    expect(root).not.toBeNull();
    expect(root!.style.position).toBe("fixed");
    expect(root!.style.right).toBe("12px");
    expect(root!.style.bottom).toBe("12px");
    expect(Number(root!.style.zIndex)).toBeGreaterThan(1000);
  });

  it("renders events received via the subscription (EC/ET/EP/EV/custom)", () => {
    let listener: ((event: TrackEvent) => void) | null = null;
    handle = mountDebugPanel({
      subscribe: (l) => {
        listener = l;
      },
    });
    expect(listener).not.toBeNull();

    listener!(makeEvent({ eventValue: "kw", eventCustom: { rowIndex: 3 } }));
    const list = panelList()!;
    expect(list.childNodes).toHaveLength(1);
    const text = list.textContent ?? "";
    expect(text).toContain("EC=biz_orderService");
    expect(text).toContain("ET=CLICK");
    expect(text).toContain("EP=Button.保存");
    expect(text).toContain("EV=kw");
    expect(text).toContain('{"rowIndex":3}');
  });

  it("caps the list at maxEvents, dropping the oldest entries", () => {
    let listener: ((event: TrackEvent) => void) | null = null;
    handle = mountDebugPanel({
      subscribe: (l) => {
        listener = l;
      },
      maxEvents: 3,
    });
    for (let i = 0; i < 5; i++) {
      listener!(makeEvent({ eventPath: `Button.${i}` }));
    }
    const list = panelList()!;
    expect(list.childNodes).toHaveLength(3);
    expect(list.textContent).not.toContain("Button.0");
    expect(list.textContent).toContain("Button.4");
  });

  it("collapses and expands when the header is clicked", () => {
    handle = mountDebugPanel({ subscribe: () => {} });
    const header = panelRoot()!.firstChild as HTMLElement;
    const list = panelList()!;
    header.click();
    expect(list.style.display).toBe("none");
    header.click();
    expect(list.style.display).toBe("");
  });

  it("highlights trackable elements on mouseover and restores on unmount", () => {
    handle = mountDebugPanel({ subscribe: () => {} });
    const button = document.createElement("button");
    button.textContent = "导出";
    document.body.appendChild(button);
    const plain = document.createElement("p");
    plain.textContent = "普通文本";
    document.body.appendChild(plain);

    button.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    expect(button.style.outline).toContain("solid");

    // Moving to a non-trackable element clears the previous highlight.
    plain.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    expect(button.style.outline).toBe("");
    expect(plain.style.outline).toBe("");

    button.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    handle.unmount();
    handle = null;
    expect(button.style.outline).toBe("");
  });

  it("highlights elements inside a table row via the tr rule", () => {
    handle = mountDebugPanel({ subscribe: () => {} });
    document.body.innerHTML +=
      "<table><tbody><tr data-row><td><span id='cell'>SO123</span></td></tr></tbody></table>";
    const cell = document.getElementById("cell")!;
    cell.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    const row = document.querySelector("tr[data-row]") as HTMLElement;
    expect(row.style.outline).toContain("solid");
  });

  it("unmount removes the panel and stops receiving events", () => {
    let listener: ((event: TrackEvent) => void) | null = null;
    handle = mountDebugPanel({
      subscribe: (l) => {
        listener = l;
      },
    });
    handle.unmount();
    handle = null;
    expect(panelRoot()).toBeNull();
    // Late events after unmount must be silently ignored.
    expect(() => listener!(makeEvent())).not.toThrow();
  });

  it("mounting twice and unmounting is safe (idempotent unmount)", () => {
    handle = mountDebugPanel({ subscribe: () => {} });
    handle.unmount();
    expect(() => handle!.unmount()).not.toThrow();
    handle = null;
  });
});
