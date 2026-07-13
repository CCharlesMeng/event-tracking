import { EventAction, type TrackEvent } from "../core/event";
import { buildEventPath, inferInstanceName } from "./inference";
import { runRecognizers, type RecognizedContext } from "./recognizers/registry";
import { findClickTarget, isChangeInScope, mapTextToAction } from "./scope";
import { hasIgnoredAncestor } from "./attributes";

export interface AutoTrackOptions {
  track: (event: Partial<TrackEvent>) => void;
  root?: Document | Element | ShadowRoot;
}

export interface AutoTrackHandle {
  stop(): void;
}

export function startAutoTrack(opts: AutoTrackOptions): AutoTrackHandle {
  let root: Document | Element | ShadowRoot | undefined;
  let handlers: Array<[string, EventListener]> = [];
  let stopped = false;
  try {
    root = opts.root ?? (typeof document !== "undefined" ? document : undefined);
    if (!root) return { stop() {} };
    handlers = [
      ["click", (event) => handleClick(event, opts)],
      ["submit", (event) => handleSubmit(event, opts)],
      ["change", (event) => handleChange(event, opts)],
    ];
    for (const [type, handler] of handlers) {
      root.addEventListener(type, handler, true);
    }
  } catch {
    /* never throw into host */
  }
  return {
    stop() {
      if (stopped) return;
      stopped = true;
      try {
        if (!root) return;
        for (const [type, handler] of handlers) {
          root.removeEventListener(type, handler, true);
        }
        handlers = [];
      } catch {
        /* never throw into host */
      }
    },
  };
}

/** Compatibility helper; callers should retain and pass the returned handle. */
export function stopAutoTrack(handle?: AutoTrackHandle | null): void {
  handle?.stop();
}

function handleClick(event: Event, opts: AutoTrackOptions): void {
  try {
    const target = asElement(event.target);
    if (!target || isIgnored(target) || isChangeInScope(target)) return;
    const control = findClickTarget(target);
    if (!control) return;
    if (isSubmitControl(control) && control.closest("form")) return;
    const context = runRecognizers(control);
    if (context) emit(context, control, EventAction.CLICK, opts);
  } catch {
    /* silent */
  }
}

function handleSubmit(event: Event, opts: AutoTrackOptions): void {
  try {
    const form = asElement(event.target);
    if (!form || form.tagName !== "FORM" || isIgnored(form)) return;
    const context = runRecognizers(form);
    if (context) emit(context, form, EventAction.SUBMIT, opts);
  } catch {
    /* silent */
  }
}

function handleChange(event: Event, opts: AutoTrackOptions): void {
  try {
    const el = asElement(event.target);
    if (!el || isIgnored(el) || !isChangeInScope(el)) return;
    const context = runRecognizers(el);
    if (context) emit(context, el, EventAction.CHANGE, opts);
  } catch {
    /* silent */
  }
}

function emit(
  context: RecognizedContext,
  sourceEl: Element,
  fallback: EventAction,
  opts: AutoTrackOptions
): void {
  const action = context.action ?? mapTextToAction(context.controlText) ?? fallback;
  const instanceName =
    context.instanceName || inferInstanceName(sourceEl, context.component) || undefined;
  const eventPath = buildEventPath({ ...context, instanceName });

  const partial: Partial<TrackEvent> = { eventType: action, eventPath };
  if (action === EventAction.SEARCH) {
    const term = findSearchTerm(sourceEl);
    if (term) partial.eventValue = term;
  }

  const custom: Record<string, unknown> = {};
  if (context.row) {
    custom.rowIndex = context.row.rowIndex;
    if (context.row.rowLabel !== undefined) custom.rowLabel = context.row.rowLabel;
  }
  if (context.controlText) custom.buttonText = context.controlText;
  if (Object.keys(custom).length > 0) partial.eventCustom = custom;

  opts.track(partial);
}

function asElement(target: EventTarget | null): Element | null {
  return target && typeof (target as Element).closest === "function" ? (target as Element) : null;
}

function isIgnored(el: Element): boolean {
  return hasIgnoredAncestor(el);
}

function isSubmitControl(el: Element): boolean {
  if (el.tagName === "BUTTON") {
    const type = el.getAttribute("type");
    return type === null || type === "submit";
  }
  return el.tagName === "INPUT" && (el as HTMLInputElement).type === "submit";
}

function findSearchTerm(el: Element): string | undefined {
  const form = el.tagName === "FORM" ? el : el.closest("form");
  if (!form) return undefined;
  const input =
    form.querySelector('input[type="search"]') ??
    form.querySelector('input[type="text"]') ??
    form.querySelector("input:not([type])");
  return (input as HTMLInputElement | null)?.value?.trim() || undefined;
}
