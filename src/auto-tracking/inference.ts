import type { RecognizedContext } from "./recognizers/registry";
import {
  TRACK_ATTRIBUTES,
  attributeSelector,
  nearestTrackAttribute,
} from "./attributes";

const NUMERIC_SEGMENT = /^\d+$/;
const UUID_SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LONG_HEX_SEGMENT = /^[0-9a-f]{16,}$/i;
const FILE_EXTENSION = /\.[a-z0-9]+$/i;

function isMeaningfulSegment(segment: string): boolean {
  return (
    segment.length > 0 &&
    !NUMERIC_SEGMENT.test(segment) &&
    !UUID_SEGMENT.test(segment) &&
    !LONG_HEX_SEGMENT.test(segment)
  );
}

/** Infer the optional module segment from an override or the current route. */
export function inferModule(root?: Document, pathname?: string): string | undefined {
  try {
    const doc = root ?? (typeof document !== "undefined" ? document : undefined);
    const override = doc
      ?.querySelector(attributeSelector(TRACK_ATTRIBUTES.module))
      ?.getAttribute(TRACK_ATTRIBUTES.module)
      ?.trim();
    if (override) return override;

    const path = pathname ?? (typeof location !== "undefined" ? location.pathname : "");
    const segments = path
      .split("/")
      .map((segment) => segment.trim().replace(FILE_EXTENSION, ""))
      .filter(isMeaningfulSegment);
    return segments.length > 0 ? segments[segments.length - 1] : undefined;
  } catch {
    return undefined;
  }
}

const CONTAINER_SELECTORS: Record<string, string> = {
  Table: "table",
  Form: "form",
  Tabs: '[role="tablist"]',
  Menu: '[role="menu"],[role="menubar"]',
  Select: "select",
};

/** Infer an eventPath instance name from explicit and nearby DOM semantics. */
export function inferInstanceName(el: Element, component?: string): string {
  try {
    const explicit = nearestTrackAttribute(el, TRACK_ATTRIBUTES.name);
    if (explicit) return explicit;

    const containerSelector = component ? CONTAINER_SELECTORS[component] : undefined;
    const container = containerSelector ? el.closest(containerSelector) : null;
    if (container) {
      const title = containerTitle(container);
      if (title) return title;
    }

    const heading = nearestHeading(container ?? el);
    if (heading) return heading;

    if (container && containerSelector && component) {
      const all = Array.from(el.ownerDocument.querySelectorAll(containerSelector));
      if (all.length > 1) return `${component}${all.indexOf(container) + 1}`;
    }
    return "";
  } catch {
    return "";
  }
}

/** Assemble component[.instanceName].control[:controlText]. */
export function buildEventPath(context: RecognizedContext): string {
  const parts: string[] = [context.component];
  if (context.instanceName) parts.push(context.instanceName);
  const { control, controlText } = context;
  if (control && controlText && control !== controlText) {
    parts.push(`${control}:${controlText}`);
  } else if (control) {
    parts.push(control);
  } else if (controlText) {
    parts.push(controlText);
  }
  return parts.join(".");
}

const MAX_NAME = 50;
const HEADING_TAG = /^H[1-6]$/;

function cleanText(el: Element | null | undefined): string | undefined {
  const text = el?.textContent?.trim().replace(/\s+/g, " ");
  return text ? text.slice(0, MAX_NAME) : undefined;
}

function containerTitle(container: Element): string | undefined {
  const caption = cleanText(container.querySelector("caption"));
  if (caption) return caption;
  for (const child of Array.from(container.children)) {
    const className = child.getAttribute("class") ?? "";
    if (child.tagName === "HEADER" || /title/i.test(className)) {
      const text = cleanText(child);
      if (text) return text;
    }
  }
  return undefined;
}

function nearestHeading(from: Element): string | undefined {
  let node: Element | null = from;
  while (node) {
    let sibling: Element | null = node.previousElementSibling;
    while (sibling) {
      if (HEADING_TAG.test(sibling.tagName)) {
        const text = cleanText(sibling);
        if (text) return text;
      }
      const nested = sibling.querySelectorAll("h1,h2,h3,h4,h5,h6");
      if (nested.length > 0) {
        const text = cleanText(nested[nested.length - 1]);
        if (text) return text;
      }
      sibling = sibling.previousElementSibling;
    }
    node = node.parentElement;
  }
  return undefined;
}
