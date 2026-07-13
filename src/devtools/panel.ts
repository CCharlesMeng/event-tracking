import type { TrackEvent } from "../core/event";
import { TRACK_ATTRIBUTES } from "../auto-tracking/attributes";

/**
 * Floating debug panel (pure DOM, inline styles, no external CSS).
 * Shows the latest events that passed the pipeline and highlights elements
 * that look auto-trackable while hovering the page. Meant to be mounted only
 * in debug mode by the final wiring phase; this module just exports functions.
 *
 * Deliberately independent of src/auto-tracking/**: the hover heuristic below is a
 * loose approximation of the auto-capture scope, not a shared implementation.
 */

const MAX_EVENTS = 50;
const HIGHLIGHT_OUTLINE = "2px solid #f5222d";

export interface DebugPanelOptions {
  /** Read-only tap on the final event stream, e.g. tracker.onDispatch. */
  subscribe: (listener: (event: TrackEvent) => void) => void | (() => void);
  /** Max entries kept in the list. Default 50. */
  maxEvents?: number;
}

export interface DebugPanelHandle {
  unmount(): void;
}

/** Loose "would auto-capture probably pick this up?" heuristic for hover highlighting. */
function findTrackableElement(target: EventTarget | null): Element | null {
  if (!(target instanceof Element)) return null;
  let el: Element | null = target;
  while (el && el !== document.body) {
    const tag = el.tagName;
    if (
      tag === "BUTTON" ||
      tag === "A" ||
      tag === "TR" ||
      el.getAttribute("role") === "button" ||
      el.hasAttribute(TRACK_ATTRIBUTES.name)
    ) {
      return el;
    }
    el = el.parentElement;
  }
  return null;
}

function eventLine(event: TrackEvent): string {
  const parts = [`EC=${event.eventCategory}`, `ET=${event.eventType}`, `EP=${event.eventPath}`];
  if (event.eventValue !== undefined) parts.push(`EV=${String(event.eventValue)}`);
  if (event.eventCustom !== undefined) {
    try {
      parts.push(`custom=${JSON.stringify(event.eventCustom)}`);
    } catch {
      parts.push("custom=<unserializable>");
    }
  }
  return parts.join(" | ");
}

/**
 * Mounts the panel into document.body and starts the hover highlighter.
 * Returns a handle whose unmount() removes all DOM nodes and listeners.
 * Every DOM operation is wrapped so a broken host page can never be crashed
 * by its own debug tooling.
 */
export function mountDebugPanel(opts: DebugPanelOptions): DebugPanelHandle {
  const maxEvents = opts.maxEvents ?? MAX_EVENTS;
  let container: HTMLElement | null = null;
  let list: HTMLElement | null = null;
  let collapsed = false;
  let unmounted = false;
  let unsubscribe: (() => void) | null = null;
  let highlighted: { el: Element; previousOutline: string } | null = null;

  const clearHighlight = () => {
    try {
      if (highlighted && highlighted.el instanceof HTMLElement) {
        highlighted.el.style.outline = highlighted.previousOutline;
      }
    } catch {
      /* silent */
    }
    highlighted = null;
  };

  const onMouseOver = (mouseEvent: MouseEvent) => {
    try {
      if (container && mouseEvent.target instanceof Node && container.contains(mouseEvent.target)) {
        return; // never highlight the panel itself
      }
      const trackable = findTrackableElement(mouseEvent.target);
      if (trackable === highlighted?.el) return;
      clearHighlight();
      if (trackable instanceof HTMLElement) {
        highlighted = { el: trackable, previousOutline: trackable.style.outline };
        trackable.style.outline = HIGHLIGHT_OUTLINE;
      }
    } catch {
      /* silent */
    }
  };

  const onEvent = (event: TrackEvent) => {
    try {
      if (unmounted || !list) return;
      const row = document.createElement("div");
      row.textContent = eventLine(event);
      row.style.cssText =
        "padding:2px 6px;border-bottom:1px solid rgba(255,255,255,0.12);word-break:break-all;";
      list.appendChild(row);
      while (list.childNodes.length > maxEvents) {
        list.removeChild(list.firstChild as Node);
      }
      list.scrollTop = list.scrollHeight;
    } catch {
      /* silent */
    }
  };

  try {
    container = document.createElement("div");
    container.setAttribute("data-event-tracking-devtools", "");
    container.style.cssText = [
      "position:fixed",
      "right:12px",
      "bottom:12px",
      "z-index:2147483646",
      "width:360px",
      "max-height:45vh",
      "display:flex",
      "flex-direction:column",
      "background:rgba(20,20,24,0.92)",
      "color:#e8e8e8",
      "font:11px/1.5 Menlo,Consolas,monospace",
      "border-radius:6px",
      "box-shadow:0 4px 16px rgba(0,0,0,0.4)",
      "overflow:hidden",
    ].join(";");

    const header = document.createElement("div");
    header.style.cssText =
      "display:flex;align-items:center;justify-content:space-between;" +
      "padding:6px 8px;background:rgba(255,255,255,0.08);cursor:pointer;user-select:none;";
    const title = document.createElement("span");
    title.textContent = "[event-tracking] debug";
    const toggle = document.createElement("span");
    toggle.textContent = "−";
    header.appendChild(title);
    header.appendChild(toggle);

    list = document.createElement("div");
    list.setAttribute("data-event-tracking-list", "");
    list.style.cssText = "overflow-y:auto;flex:1;min-height:0;";

    header.addEventListener("click", () => {
      try {
        collapsed = !collapsed;
        if (list) list.style.display = collapsed ? "none" : "";
        toggle.textContent = collapsed ? "+" : "−";
      } catch {
        /* silent */
      }
    });

    container.appendChild(header);
    container.appendChild(list);
    document.body.appendChild(container);
    document.addEventListener("mouseover", onMouseOver, true);
    unsubscribe = opts.subscribe(onEvent) ?? null;
  } catch {
    /* mounting failed silently; unmount stays safe to call */
  }

  return {
    unmount() {
      try {
        unsubscribe?.();
      } catch {
        /* a broken subscriber cannot block DOM teardown */
      }
      unsubscribe = null;
      try {
        unmounted = true;
        clearHighlight();
        document.removeEventListener("mouseover", onMouseOver, true);
        container?.parentNode?.removeChild(container);
        container = null;
        list = null;
      } catch {
        /* silent */
      }
    },
  };
}
