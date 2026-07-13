import type { InitConfig } from "../config";
import type { TrackEvent } from "../core/event";
import type {
  PlatformAdapter,
  PlatformScriptConfig,
  PlatformSdkContract,
  PlatformSdkInstance,
} from "../core/ports";

/** @deprecated Use PlatformSdkInstance from the public entry. */
export type PlatformInstance = PlatformSdkInstance;

export interface ScriptAdapterOptions {
  contract?: PlatformSdkContract;
  script?: PlatformScriptConfig;
  /** @deprecated Use script.url. */
  cdnUrl?: string;
  globalName?: string;
  appId?: string;
  debug?: boolean;
}

/**
 * Shared lifecycle for adapters backed by a page global and optional CDN
 * script. Platform-specific invocation and payload mapping are supplied as an
 * explicit, independently testable contract; this class never guesses them.
 */
export abstract class ScriptPlatformAdapter implements PlatformAdapter {
  abstract readonly name: string;
  protected abstract readonly defaultGlobalName: string;

  private instance: PlatformInstance | null = null;
  private debug = false;
  private readyListeners = new Set<() => void>();
  private script: HTMLScriptElement | null = null;
  private removeScriptListeners: (() => void) | null = null;
  private setupStarted = false;

  constructor(protected readonly options: ScriptAdapterOptions = {}) {}

  setup(config: InitConfig): void {
    if (this.setupStarted) return;
    this.setupStarted = true;
    this.debug = this.options.debug ?? config.debug ?? false;
    if (!this.options.contract) {
      this.warn("no verified platform contract configured; adapter stays not-ready");
      return;
    }
    if (this.readyInstance()) {
      this.notifyReady();
      return;
    }
    const scriptConfig =
      this.options.script ??
      (this.options.cdnUrl ? { url: this.options.cdnUrl } : undefined);
    if (!scriptConfig) {
      this.warn(
        `no ready ${this.globalName()} instance and no script configured; adapter stays not-ready`
      );
      return;
    }
    this.injectScript(scriptConfig);
  }

  isReady(): boolean {
    return this.readyInstance() !== null;
  }

  report(event: TrackEvent): void {
    const instance = this.readyInstance();
    const contract = this.options.contract;
    if (!instance || !contract) return;
    try {
      contract.report(instance, event, {
        platformName: this.name,
        appId: this.options.appId,
      });
    } catch (error) {
      this.warn("verified platform contract threw while reporting", error);
    }
  }

  onReady(listener: () => void): () => void {
    this.readyListeners.add(listener);
    return () => this.readyListeners.delete(listener);
  }

  teardown(): void {
    const context = {
      platformName: this.name,
      appId: this.options.appId,
    };
    try {
      if (this.instance) {
        this.options.contract?.teardown?.(this.instance, context);
      }
    } catch (error) {
      this.warn("platform contract teardown threw", error);
    }
    try {
      this.removeScriptListeners?.();
      this.script?.remove();
    } catch {
      /* teardown must never throw */
    }
    this.removeScriptListeners = null;
    this.script = null;
    this.readyListeners.clear();
    this.instance = null;
    this.setupStarted = false;
  }

  protected globalName(): string {
    return this.options.globalName ?? this.defaultGlobalName;
  }

  private readyInstance(): PlatformInstance | null {
    const instance = this.probeGlobal();
    const contract = this.options.contract;
    if (!instance || !contract) return null;
    try {
      return contract.isReady?.(instance) === false ? null : instance;
    } catch (error) {
      this.warn("platform contract readiness check threw", error);
      return null;
    }
  }

  private probeGlobal(): PlatformInstance | null {
    if (this.instance) return this.instance;
    try {
      const candidate = (globalThis as Record<string, unknown>)[this.globalName()];
      if (candidate && (typeof candidate === "object" || typeof candidate === "function")) {
        this.instance = candidate as PlatformInstance;
      }
    } catch {
      /* probing must never throw into the host */
    }
    return this.instance;
  }

  private injectScript(config: PlatformScriptConfig): void {
    try {
      if (typeof document === "undefined") return;
      const url = this.resolveScriptUrl(config);
      if (!url) return;
      for (const existing of Array.from(document.getElementsByTagName("script"))) {
        if (existing.src === url.href) {
          if (!this.matchesSecurityConfig(existing, config)) {
            this.warn(`existing script security attributes do not match ${url.href}`);
            return;
          }
          this.listenForScript(existing);
          return;
        }
      }
      const script = document.createElement("script");
      script.src = url.href;
      script.async = true;
      this.applySecurityConfig(script, config);
      this.script = script;
      this.listenForScript(script);
      (document.head ?? document.documentElement).appendChild(script);
    } catch (error) {
      this.warn("script injection failed", error);
    }
  }

  private resolveScriptUrl(config: PlatformScriptConfig): URL | null {
    try {
      const base =
        typeof document !== "undefined" && document.baseURI
          ? document.baseURI
          : "https://invalid.local/";
      const url = new URL(config.url, base);
      if (url.protocol !== "https:" || url.username || url.password) {
        this.warn("platform script rejected: URL must be credential-free HTTPS");
        return null;
      }
      if (
        config.allowedOrigins &&
        !config.allowedOrigins.some((origin) => origin === url.origin)
      ) {
        this.warn(`platform script rejected: origin ${url.origin} is not allowlisted`);
        return null;
      }
      return url;
    } catch (error) {
      this.warn("platform script rejected: invalid URL", error);
      return null;
    }
  }

  private applySecurityConfig(
    script: HTMLScriptElement,
    config: PlatformScriptConfig,
  ): void {
    if (config.integrity) script.integrity = config.integrity;
    if (config.nonce) script.nonce = config.nonce;
    if (config.crossOrigin) {
      script.crossOrigin = config.crossOrigin;
    } else if (config.integrity) {
      script.crossOrigin = "anonymous";
    }
    if (config.referrerPolicy) script.referrerPolicy = config.referrerPolicy;
  }

  private matchesSecurityConfig(
    script: HTMLScriptElement,
    config: PlatformScriptConfig,
  ): boolean {
    const expectedCrossOrigin =
      config.crossOrigin ?? (config.integrity ? "anonymous" : "");
    return (
      (!config.integrity || script.integrity === config.integrity) &&
      (!config.nonce || script.nonce === config.nonce) &&
      (!expectedCrossOrigin || script.crossOrigin === expectedCrossOrigin) &&
      (!config.referrerPolicy || script.referrerPolicy === config.referrerPolicy)
    );
  }

  private listenForScript(script: HTMLScriptElement): void {
    const onLoad = () => {
      if (this.readyInstance()) {
        this.notifyReady();
      } else {
        this.warn(
          `script loaded from ${script.src} but ${this.globalName()} did not satisfy its contract`
        );
      }
    };
    const onError = () => {
      this.warn(`failed to load platform SDK from ${script.src}; adapter stays not-ready`);
    };
    script.addEventListener("load", onLoad);
    script.addEventListener("error", onError);
    this.removeScriptListeners = () => {
      script.removeEventListener("load", onLoad);
      script.removeEventListener("error", onError);
    };
  }

  private notifyReady(): void {
    for (const listener of [...this.readyListeners]) {
      try {
        listener();
      } catch {
        /* readiness listeners must never throw into the host */
      }
    }
  }

  private warn(message: string, error?: unknown): void {
    try {
      if (this.debug && typeof console !== "undefined") {
        console.warn(`[event-tracking:${this.name}] ${message}`, error ?? "");
      }
    } catch {
      /* logging must never throw into the host */
    }
  }
}
