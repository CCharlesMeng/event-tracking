import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  watchErrorStates,
  type ErrorStateWatcher,
} from "../../src/auto-tracking/error-state";
import type { TrackEvent } from "../../src/core/event";

const THROTTLE_MS = 10;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Waits past the batch window so the throttled scan has fired. */
function flushed(): Promise<void> {
  return sleep(THROTTLE_MS * 4);
}

describe("watchErrorStates", () => {
  let tracked: Partial<TrackEvent>[] = [];
  let watcher: ErrorStateWatcher | null = null;

  const track = (event: Partial<TrackEvent>) => tracked.push(event);

  const watch = () =>
    watchErrorStates({ track, root: document.body, throttleMs: THROTTLE_MS });

  beforeEach(() => {
    tracked = [];
    document.body.innerHTML = "";
  });

  afterEach(() => {
    watcher?.stop();
    watcher = null;
  });

  function addState(className: string, text: string): HTMLElement {
    const el = document.createElement("div");
    if (className) el.className = className;
    el.textContent = text;
    document.body.appendChild(el);
    return el;
  }

  it("tracks an empty-state element appearing in the DOM", async () => {
    watcher = watch();
    await flushed(); // initial scan of an empty body

    addState("ant-empty", "暂无数据");
    await flushed();

    expect(tracked).toHaveLength(1);
    expect(tracked[0].eventType).toBe("EXPOSE");
    expect(tracked[0].eventPath).toBe("ErrorState.空态");
    expect(tracked[0].eventCustom).toMatchObject({ stateType: "empty", text: "暂无数据" });
  });

  it("classifies error and forbidden states (by class or by text)", async () => {
    watcher = watch();
    addState("load-error", "加载失败，请重试");
    addState("", "无权限访问该页面");
    await flushed();

    const types = tracked.map((e) => (e.eventCustom as Record<string, unknown>).stateType);
    expect(types).toContain("error");
    expect(types).toContain("forbidden");
    const paths = tracked.map((e) => e.eventPath);
    expect(paths).toContain("ErrorState.错误");
    expect(paths).toContain("ErrorState.无权限");
  });

  it("reports states already present in the DOM before watching", async () => {
    addState("empty-placeholder", "暂无数据");
    watcher = watch();
    await flushed();
    expect(tracked).toHaveLength(1);
    expect((tracked[0].eventCustom as Record<string, unknown>).stateType).toBe("empty");
  });

  it("deduplicates: the same element is reported only once", async () => {
    watcher = watch();
    const emptyEl = addState("no-data", "暂无数据");
    await flushed();
    expect(tracked).toHaveLength(1);

    // Re-attaching the very same element must not produce a second report.
    document.body.removeChild(emptyEl);
    document.body.appendChild(emptyEl);
    await flushed();
    expect(tracked).toHaveLength(1);
  });

  it("batches many insertions into one throttled scan", async () => {
    watcher = watch();
    await flushed(); // let the initial scan pass first
    for (let i = 0; i < 3; i++) addState("error-block", `错误 ${i}`);
    expect(tracked).toHaveLength(0); // nothing before the batch window fires
    await flushed();
    expect(tracked).toHaveLength(3);
  });

  it("reports the outermost matching element only (no parent+child double counting)", async () => {
    watcher = watch();
    const el = addState("result-error", "出错了");
    el.innerHTML = '出错了<span class="error-icon">!</span>';
    await flushed();
    expect(tracked).toHaveLength(1);
  });

  it("detects a class swap turning a loader into an error state", async () => {
    watcher = watch();
    const el = addState("loading", "加载中");
    await flushed();
    expect(tracked).toHaveLength(0);

    el.className = "load-error";
    await flushed();
    expect(tracked).toHaveLength(1);
    expect((tracked[0].eventCustom as Record<string, unknown>).stateType).toBe("error");
  });

  it("truncates long state text to 100 chars", async () => {
    watcher = watch();
    addState("fetch-error", "长".repeat(300));
    await flushed();
    expect(tracked).toHaveLength(1);
    expect(((tracked[0].eventCustom as Record<string, unknown>).text as string).length).toBe(100);
  });

  it("stops observing after stop()", async () => {
    watcher = watch();
    await flushed();
    watcher.stop();
    addState("ant-empty", "暂无数据");
    await flushed();
    expect(tracked).toHaveLength(0);
  });

  it("does not report unrelated content", async () => {
    watcher = watch();
    addState("", "订单列表加载完成，共 20 条");
    await flushed();
    expect(tracked).toHaveLength(0);
  });

  it("ignores huge containers whose deep text merely contains a keyword", async () => {
    watcher = watch();
    const container = document.createElement("div");
    container.innerHTML =
      `<p>${"很长的正文内容。".repeat(20)}</p><div class="ant-empty">暂无数据</div>`;
    document.body.appendChild(container);
    await flushed();
    // Only the inner empty-state div is reported, not the whole container.
    expect(tracked).toHaveLength(1);
    expect((tracked[0].eventCustom as Record<string, unknown>).stateType).toBe("empty");
    expect((tracked[0].eventCustom as Record<string, unknown>).text).toBe("暂无数据");
  });

  it("swallows a throwing track sink", async () => {
    watcher = watchErrorStates({
      track: () => {
        throw new Error("sink boom");
      },
      root: document.body,
      throttleMs: THROTTLE_MS,
    });
    addState("ant-empty", "暂无数据");
    await expect(flushed()).resolves.toBeUndefined();
  });
});
