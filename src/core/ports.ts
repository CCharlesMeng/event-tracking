import type { InitConfig } from "../config";
import type { TrackEvent } from "./event";

/**
 * Extension contract for reporting platforms such as Furion and UEM.
 *
 * @public Extension API. Implementations may be registered through
 * `registerAdapter`; duplicate names are rejected and teardown is optional.
 */
export interface PlatformAdapter {
  /** Unique adapter name, e.g. "furion" | "uem". */
  name: string;
  /** Detect an existing platform instance or initialize the platform SDK. */
  setup(config: InitConfig): void | Promise<void>;
  /** True once the underlying platform can accept reports. */
  isReady(): boolean;
  /** Report a single event. Errors are isolated by the router. */
  report(event: TrackEvent): void;
  /**
   * Optional readiness signal for adapters that become ready independently
   * from setup(). Resolving an async setup() also triggers a readiness check.
   */
  onReady?(listener: () => void): () => void;
  /** Optional teardown for listeners, pending script loads and platform resources. */
  teardown?(): void | Promise<void>;
}

/** Page-global SDK value discovered by a script-backed platform adapter. */
export type PlatformSdkInstance =
  | Record<string, unknown>
  | ((...args: unknown[]) => unknown);

/** Stable metadata supplied to an explicit platform contract. */
export interface PlatformReportContext {
  readonly platformName: string;
  readonly appId?: string;
}

/**
 * Explicit boundary between this package and an externally documented SDK.
 *
 * The package deliberately does not guess method names or payload fields.
 * Integrators provide this contract from the platform's verified documentation
 * and can test it independently with their platform fixture.
 */
export interface PlatformSdkContract {
  /** Optional platform-specific readiness check after the page global exists. */
  isReady?(instance: PlatformSdkInstance): boolean;
  /** Invoke the documented SDK method and perform its documented field mapping. */
  report(
    instance: PlatformSdkInstance,
    event: TrackEvent,
    context: PlatformReportContext,
  ): void;
  /** Optional cleanup for resources owned by this explicit contract. */
  teardown?(
    instance: PlatformSdkInstance,
    context: PlatformReportContext,
  ): void;
}

export type PlatformScriptReferrerPolicy =
  | "no-referrer"
  | "no-referrer-when-downgrade"
  | "origin"
  | "origin-when-cross-origin"
  | "same-origin"
  | "strict-origin"
  | "strict-origin-when-cross-origin"
  | "unsafe-url";

/** Security policy for an optionally self-loaded external platform script. */
export interface PlatformScriptConfig {
  /** Absolute or document-relative script URL. Only HTTPS is accepted. */
  url: string;
  /** Optional exact origin allowlist, e.g. ["https://cdn.example.com"]. */
  allowedOrigins?: readonly string[];
  /** Subresource Integrity metadata, including its algorithm prefix. */
  integrity?: string;
  /** CSP nonce copied to the injected script element. */
  nonce?: string;
  /** CORS mode; defaults to "anonymous" when integrity is present. */
  crossOrigin?: "anonymous" | "use-credentials";
  /** Referrer policy for the platform script request. */
  referrerPolicy?: PlatformScriptReferrerPolicy;
}

/**
 * Transforms an event before dispatch, or returns null to drop it.
 *
 * @public Extension API.
 */
export type PipelineHook = (event: TrackEvent) => TrackEvent | null;

/**
 * Infers the optional module segment used in eventCategory.
 *
 * @public Extension API.
 */
export type ModuleInferrer = () => string | undefined;
