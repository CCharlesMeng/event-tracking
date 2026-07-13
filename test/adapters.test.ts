import { afterEach, describe, expect, it, vi } from "vitest";
import { createFurionAdapter } from "../src/adapters/furion";
import { createUemAdapter } from "../src/adapters/uem";
import type { TrackEvent } from "../src/core/event";
import type { InitConfig } from "../src/config";
import { fakePlatformContract } from "./helpers";

const config: InitConfig = { businessType: "biz", serviceName: "svc" };

const event: TrackEvent = {
  eventCategory: "biz_svc_orderList",
  eventType: "CLICK",
  eventPath: "Table.订单列表.导出",
  eventValue: "range:month",
  eventCustom: { rowIndex: 3 },
};
const furionContract = fakePlatformContract("report");
const uemContract = fakePlatformContract("track");

function injectedScripts(): HTMLScriptElement[] {
  return Array.from(document.getElementsByTagName("script"));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  for (const script of injectedScripts()) script.remove();
  history.replaceState(null, "", "/");
});

describe("FurionAdapter", () => {
  it("reuses an existing global instance and reports the mapped payload", () => {
    history.replaceState(null, "", "/orders?token=secret#customer");
    const report = vi.fn();
    vi.stubGlobal("Furion", { report });
    const adapter = createFurionAdapter({ appId: "app-1", contract: furionContract });

    adapter.setup(config);

    expect(adapter.name).toBe("furion");
    expect(adapter.isReady()).toBe(true);
    expect(injectedScripts()).toHaveLength(0); // reused, not injected

    adapter.report(event);
    expect(report).toHaveBeenCalledTimes(1);
    const payload = report.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload).toMatchObject({
      eventCategory: "biz_svc_orderList",
      eventType: "CLICK",
      eventPath: "Table.订单列表.导出",
      eventValue: "range:month",
      eventCustom: { rowIndex: 3 },
      appId: "app-1",
    });
    expect(payload).not.toHaveProperty("timestamp");
    expect(payload).not.toHaveProperty("pageUrl");
  });

  it("probes a custom global name from options", () => {
    const report = vi.fn();
    vi.stubGlobal("MyFurion", { report });
    const adapter = createFurionAdapter({
      globalName: "MyFurion",
      contract: furionContract,
    });

    adapter.setup(config);
    adapter.report(event);

    expect(adapter.isReady()).toBe(true);
    expect(report).toHaveBeenCalledTimes(1);
  });

  it("injects a script tag when no instance exists and becomes ready on load", () => {
    const adapter = createFurionAdapter({
      contract: furionContract,
      script: { url: "https://cdn.example.com/furion.js" },
    });
    const ready = vi.fn();
    adapter.onReady?.(ready);

    adapter.setup(config);

    const script = injectedScripts().find(
      (s) => s.getAttribute("src") === "https://cdn.example.com/furion.js"
    );
    expect(script).toBeDefined();
    expect(adapter.isReady()).toBe(false);

    // simulate the CDN script executing (defines the global), then onload firing
    vi.stubGlobal("Furion", { report: vi.fn() });
    script!.dispatchEvent(new Event("load"));
    expect(adapter.isReady()).toBe(true);
    expect(ready).toHaveBeenCalledOnce();
  });

  it("stays not-ready and silent when script injection fails", () => {
    const adapter = createFurionAdapter({
      contract: furionContract,
      script: { url: "https://cdn.example.com/furion.js" },
    });
    adapter.setup(config);

    const script = injectedScripts()[0]!;
    expect(() => script.dispatchEvent(new Event("error"))).not.toThrow();
    expect(adapter.isReady()).toBe(false);
    expect(() => adapter.report(event)).not.toThrow();
  });

  it("does not inject a duplicate script for the same url", () => {
    const url = "https://cdn.example.com/furion.js";
    createFurionAdapter({ contract: furionContract, script: { url } }).setup(config);
    createFurionAdapter({ contract: furionContract, script: { url } }).setup(config);

    const matching = injectedScripts().filter((s) => s.getAttribute("src") === url);
    expect(matching).toHaveLength(1);
  });

  it("teardown removes an injected pending script and remains safe", () => {
    const adapter = createFurionAdapter({
      contract: furionContract,
      script: { url: "https://cdn.example.com/furion.js" },
    });
    adapter.setup(config);
    expect(injectedScripts()).toHaveLength(1);

    expect(() => adapter.teardown?.()).not.toThrow();
    expect(injectedScripts()).toHaveLength(0);
    expect(adapter.isReady()).toBe(false);
  });

  it("runs explicit contract teardown once and keeps repeated teardown safe", () => {
    const teardown = vi.fn();
    vi.stubGlobal("Furion", { report: vi.fn() });
    const adapter = createFurionAdapter({
      contract: { ...furionContract, teardown },
    });
    adapter.setup(config);

    adapter.teardown?.();
    adapter.teardown?.();

    expect(teardown).toHaveBeenCalledOnce();
  });

  it("stays not-ready without throwing when there is no instance and no script", () => {
    const adapter = createFurionAdapter({ contract: furionContract });
    expect(() => adapter.setup(config)).not.toThrow();
    expect(adapter.isReady()).toBe(false);
    expect(injectedScripts()).toHaveLength(0);
  });

  it("invokes only the method selected by the explicit contract", () => {
    const send = vi.fn();
    const report = vi.fn();
    vi.stubGlobal("Furion", { report, send });
    const adapter = createFurionAdapter({ contract: fakePlatformContract("send") });

    adapter.setup(config);
    adapter.report(event);

    expect(send).toHaveBeenCalledTimes(1);
    expect(report).not.toHaveBeenCalled();
  });

  it("does not guess a method when no platform contract is configured", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const report = vi.fn();
    vi.stubGlobal("Furion", { report });
    const adapter = createFurionAdapter({ debug: true });

    adapter.setup(config);
    expect(adapter.isReady()).toBe(false);
    expect(() => adapter.report(event)).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]![0])).toContain("no verified platform contract");
    expect(report).not.toHaveBeenCalled();
  });

  it("keeps a contract mismatch isolated when debug is off", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("Furion", {});
    const adapter = createFurionAdapter({ contract: furionContract });

    adapter.setup(config);
    adapter.report(event);

    expect(warn).not.toHaveBeenCalled();
  });

  it("swallows a throwing platform report call", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("Furion", {
      report: () => {
        throw new Error("platform exploded");
      },
    });
    const adapterWithContract = createFurionAdapter({
      contract: furionContract,
      debug: true,
    });

    adapterWithContract.setup(config);
    expect(() => adapterWithContract.report(event)).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe("UemAdapter", () => {
  it("reuses window.UEM and follows the explicit track contract", () => {
    const track = vi.fn();
    const send = vi.fn();
    vi.stubGlobal("UEM", { track, send });
    const adapter = createUemAdapter({ appId: "app-2", contract: uemContract });

    adapter.setup(config);

    expect(adapter.name).toBe("uem");
    expect(adapter.isReady()).toBe(true);
    adapter.report(event);
    expect(track).toHaveBeenCalledTimes(1);
    expect(send).not.toHaveBeenCalled();
    const payload = track.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload).toMatchObject({
      eventPath: "Table.订单列表.导出",
      appId: "app-2",
    });
    expect(payload).not.toHaveProperty("timestamp");
    expect(payload).not.toHaveProperty("pageUrl");
  });

  it("injects the UEM script when no instance exists and becomes ready on load", () => {
    const adapter = createUemAdapter({
      contract: uemContract,
      script: { url: "https://cdn.example.com/uem.js" },
    });

    adapter.setup(config);

    const script = injectedScripts().find(
      (s) => s.getAttribute("src") === "https://cdn.example.com/uem.js"
    );
    expect(script).toBeDefined();
    expect(adapter.isReady()).toBe(false);

    vi.stubGlobal("UEM", { track: vi.fn() });
    script!.dispatchEvent(new Event("load"));
    expect(adapter.isReady()).toBe(true);
  });
});

describe("script loading security", () => {
  it("does not load any external script without a verified contract", () => {
    createFurionAdapter({
      script: { url: "https://cdn.example.com/furion.js" },
    }).setup(config);

    expect(injectedScripts()).toHaveLength(0);
  });

  it.each([
    "javascript:alert(1)",
    "data:text/javascript,alert(1)",
    "http://cdn.example.com/platform.js",
    "https://user:secret@cdn.example.com/platform.js",
  ])("rejects unsafe script URL %s", (url) => {
    createFurionAdapter({
      contract: furionContract,
      script: { url },
    }).setup(config);

    expect(injectedScripts()).toHaveLength(0);
  });

  it("enforces an exact origin allowlist", () => {
    createFurionAdapter({
      contract: furionContract,
      script: {
        url: "https://cdn.example.com/furion.js",
        allowedOrigins: ["https://trusted.example.com"],
      },
    }).setup(config);

    expect(injectedScripts()).toHaveLength(0);
  });

  it("applies SRI, CSP, CORS and referrer-policy attributes", () => {
    createFurionAdapter({
      contract: furionContract,
      script: {
        url: "https://cdn.example.com/furion.js",
        allowedOrigins: ["https://cdn.example.com"],
        integrity: "sha384-fixture",
        nonce: "nonce-fixture",
        referrerPolicy: "no-referrer",
      },
    }).setup(config);

    const script = injectedScripts()[0]!;
    expect(script.integrity).toBe("sha384-fixture");
    expect(script.nonce).toBe("nonce-fixture");
    expect(script.crossOrigin).toBe("anonymous");
    expect(script.referrerPolicy).toBe("no-referrer");
  });
});

describe("symmetric platform contract", () => {
  it("gives Furion and UEM the same canonical event and explicit context", () => {
    const furionCapture = vi.fn();
    const uemCapture = vi.fn();
    const contract = fakePlatformContract("capture");
    vi.stubGlobal("Furion", { capture: furionCapture });
    vi.stubGlobal("UEM", { capture: uemCapture });
    const furion = createFurionAdapter({ appId: "same-app", contract });
    const uem = createUemAdapter({ appId: "same-app", contract });

    furion.setup(config);
    uem.setup(config);
    furion.report(event);
    uem.report(event);

    expect(furionCapture).toHaveBeenCalledOnce();
    expect(uemCapture).toHaveBeenCalledOnce();
    expect(furionCapture.mock.calls[0]![0]).toEqual(uemCapture.mock.calls[0]![0]);
    expect(furionCapture.mock.calls[0]![0]).toEqual({ ...event, appId: "same-app" });
  });
});
