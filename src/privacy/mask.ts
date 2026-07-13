import type { TrackEvent } from "../core/event";
import type { PipelineHook } from "../core/ports";

/**
 * Built-in regex masking (defense in depth, always on by default):
 * CN mobile phone, CN ID card (15/18), bank card (13-19 digits), email.
 * Each match keeps a small readable prefix/suffix and stars the middle,
 * so dashboards stay debuggable without leaking PII.
 */

/** Replaces the middle of a digit run, keeping the first 3 and last 4 chars. */
function keep3And4(match: string): string {
  return match.slice(0, 3) + "*".repeat(match.length - 7) + match.slice(-4);
}

/** 11-digit CN mobile: 138****5678 (exactly four stars per spec example). */
const PHONE_RE = /(?<!\d)1[3-9]\d{9}(?!\d)/g;
/** 18-digit CN ID card, possibly ending in X/x. Runs before the generic digit-run rule. */
const ID18_RE = /(?<!\d)\d{17}[\dXx](?![\dXx])/g;
/**
 * Generic 13-19 digit run: bank cards, and also 15-digit ID cards (the two
 * are indistinguishable by length alone; both get the same keep-3/keep-4 mask).
 */
const DIGIT_RUN_RE = /(?<!\d)\d{13,19}(?!\d)/g;
/** Local part masked to its first char (a***@x.com); the domain is not PII. */
const EMAIL_RE = /([A-Za-z0-9._%+-]+)@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)/g;

/** Masks all built-in PII patterns inside a text. Exported for reuse by other modules. */
export function maskText(text: string): string {
  let result = text;
  result = result.replace(
    EMAIL_RE,
    (_m, local: string, domain: string) => `${local.charAt(0)}***@${domain}`,
  );
  result = result.replace(PHONE_RE, (m) => m.slice(0, 3) + "****" + m.slice(-4));
  result = result.replace(ID18_RE, keep3And4);
  result = result.replace(DIGIT_RUN_RE, keep3And4);
  return result;
}

const BLACKLIST_REPLACEMENT = "***";

/**
 * Recursively masks string values inside objects/arrays. Keys matching the
 * blacklist have their value replaced wholesale with "***" at any depth.
 * Never mutates the input; circular references are cut with "***".
 */
function maskDeep(value: unknown, blacklist: ReadonlySet<string>, seen: WeakSet<object>): unknown {
  if (typeof value === "string") return maskText(value);
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return BLACKLIST_REPLACEMENT;
  seen.add(value);
  if (Array.isArray(value)) {
    return value.map((item) => maskDeep(item, blacklist, seen));
  }
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value)) {
    out[key] = blacklist.has(key) ? BLACKLIST_REPLACEMENT : maskDeep(val, blacklist, seen);
  }
  return out;
}

export interface MaskHookOptions {
  /** Field names (matched at any depth of eventCustom) replaced with "***". Pass config.fieldBlacklist here. */
  fieldBlacklist?: string[];
  /** Aggregate-only diagnostic callback; the original event is never exposed. */
  onError?: () => void;
}

/**
 * Pipeline hook factory for tracker.use(). Masks eventPath, string eventValue
 * and deep eventCustom values. On failure it drops the event (privacy-first).
 */
export function createMaskHook(options: MaskHookOptions = {}): PipelineHook {
  const blacklist = new Set(options.fieldBlacklist ?? []);
  return (event: TrackEvent): TrackEvent | null => {
    try {
      const masked: TrackEvent = { ...event };
      masked.eventPath = maskText(masked.eventPath);
      if (typeof masked.eventValue === "string") {
        masked.eventValue = maskText(masked.eventValue);
      }
      if (masked.eventCustom !== undefined) {
        masked.eventCustom = maskDeep(masked.eventCustom, blacklist, new WeakSet()) as Record<
          string,
          unknown
        >;
      }
      return masked;
    } catch {
      try {
        options.onError?.();
      } catch {
        /* diagnostics must not weaken the privacy boundary */
      }
      return null;
    }
  };
}
