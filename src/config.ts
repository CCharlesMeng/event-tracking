import type { TrackEvent } from "./core/event";
import { isValidIdentitySegment } from "./core/event";
import type { PlatformScriptConfig, PlatformSdkContract } from "./core/ports";

/** Per-platform configuration for an explicitly documented SDK contract. */
export interface PlatformConfig {
  /** Enable this platform. Defaults to true when the entry is present. */
  enabled?: boolean;
  /**
   * Verified SDK invocation and payload mapping supplied by the integrator.
   * Without it the built-in adapter remains not-ready and loads no script.
   */
  contract?: PlatformSdkContract;
  /** Security policy for optional SDK script self-loading. */
  script?: PlatformScriptConfig;
  /** @deprecated Use script.url. HTTPS validation still applies. */
  cdnUrl?: string;
  /** Page global holding the platform instance (default: "Furion" / "UEM"). */
  globalName?: string;
  /** Application id exposed only to the explicit contract context. */
  appId?: string;
  /** Platform-specific metadata retained for compatibility; adapters do not interpret it. */
  [key: string]: unknown;
}

/** Known platforms get first-class keys; other adapters can still be registered manually. */
export interface PlatformsConfig {
  furion?: PlatformConfig;
  uem?: PlatformConfig;
}

export interface InitConfig {
  /** First segment of the auto-composed eventCategory. */
  businessType: string;
  /** Second segment of the auto-composed eventCategory. */
  serviceName: string;
  /** Which platforms to fan out to. Both entries present = fan out to both. */
  platforms?: PlatformsConfig;
  /** Enable automatic DOM capture. Default: true. */
  autoTrack?: boolean;
  /** Enable exposure tracking of error/empty/forbidden UI states. Default: false (conservative). */
  trackErrorStates?: boolean;
  /** When true, internal errors are logged via console.warn instead of being fully silent. */
  debug?: boolean;
  /**
   * Last-chance hook before an event is dispatched.
   * Return the (possibly modified) event to continue, or null/false to drop it.
   */
  beforeReport?: (event: TrackEvent) => TrackEvent | null | false;
  /** Field names whose values must be masked/dropped by the privacy layer. */
  fieldBlacklist?: string[];
}

/** InitConfig with conservative defaults applied (no remote kill-switch exists, so defaults must be safe). */
export type ResolvedConfig = InitConfig &
  Required<Pick<InitConfig, "autoTrack" | "debug" | "fieldBlacklist" | "trackErrorStates">>;

/** Returns a stable reason code instead of throwing into the integrating page. */
export function validateInitConfig(config: InitConfig): string | null {
  if (!config || typeof config !== "object") return "invalid-config";
  if (!isValidIdentitySegment(config.businessType)) return "invalid-business-type";
  if (!isValidIdentitySegment(config.serviceName)) return "invalid-service-name";
  return null;
}

export function resolveConfig(config: InitConfig): ResolvedConfig {
  return {
    ...config,
    autoTrack: config.autoTrack ?? true,
    debug: config.debug ?? false,
    fieldBlacklist: config.fieldBlacklist ?? [],
    trackErrorStates: config.trackErrorStates ?? false,
  };
}
