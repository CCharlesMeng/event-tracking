import { EventAction } from "../../core/event";
import { findPaginationContainer, mapTextToAction } from "../scope";
import { TRACK_ATTRIBUTES, nearestTrackAttribute } from "../attributes";
import type { RecognizedContext, RecognizedRow, Recognizer } from "./registry";

const MAX_TEXT = 50;

/** Native-DOM fallback recognizer; always last in the registry chain. */
export const genericDomRecognizer: Recognizer = {
  name: "generic",
  recognize(target: Element): RecognizedContext | null {
    return (
      recognizeFormControl(target) ??
      recognizeTab(target) ??
      recognizeMenuItem(target) ??
      recognizePagination(target) ??
      recognizeForm(target) ??
      recognizeInTable(target) ??
      recognizeButton(target)
    );
  },
};

function recognizeFormControl(el: Element): RecognizedContext | null {
  if (el.getAttribute("role") === "switch") {
    const isOn = el.getAttribute("aria-checked") === "true";
    return withOverrides(el, "Switch", {
      action: isOn ? EventAction.OFF : EventAction.ON,
      controlText: labelTextFor(el),
    });
  }
  if (el.tagName === "SELECT") {
    return withOverrides(el, "Select", {
      action: EventAction.SELECT,
      controlText: labelTextFor(el),
    });
  }
  if (el.tagName === "INPUT") {
    const input = el as HTMLInputElement;
    if (input.type === "checkbox") {
      if (isSwitchLike(input)) {
        return withOverrides(el, "Switch", {
          action: input.checked ? EventAction.ON : EventAction.OFF,
          controlText: labelTextFor(input),
        });
      }
      return withOverrides(el, "Checkbox", {
        action: input.checked ? EventAction.CHECK : EventAction.UNCHECK,
        controlText: labelTextFor(input),
      });
    }
    if (input.type === "radio") {
      return withOverrides(el, "Radio", {
        action: EventAction.SELECT,
        controlText: labelTextFor(input),
      });
    }
  }
  return null;
}

function recognizeTab(el: Element): RecognizedContext | null {
  const tab = el.closest('[role="tab"]');
  if (!tab) return null;
  return withOverrides(tab, "Tabs", {
    action: EventAction.SELECT,
    controlText: textOf(tab),
  });
}

function recognizeMenuItem(el: Element): RecognizedContext | null {
  const item = el.closest('[role="menuitem"]');
  return item ? withOverrides(item, "Menu", { controlText: textOf(item) }) : null;
}

function recognizePagination(el: Element): RecognizedContext | null {
  if (!findPaginationContainer(el)) return null;
  const item = el.closest("li,button,a") ?? el;
  return withOverrides(el, "Pagination", {
    action: EventAction.CLICK,
    controlText: textOf(item),
  });
}

function recognizeForm(el: Element): RecognizedContext | null {
  if (el.tagName !== "FORM") return null;
  const submitButton = el.querySelector(
    'button[type="submit"], input[type="submit"], button:not([type])'
  );
  const buttonText = textOf(submitButton);
  const context = withOverrides(el, "Form", {
    action: isSearchForm(el, buttonText) ? EventAction.SEARCH : EventAction.SUBMIT,
  });
  if (buttonText) context.controlText = buttonText;
  return context;
}

function recognizeInTable(el: Element): RecognizedContext | null {
  if (!el.closest("table")) return null;
  const control =
    el.closest('button, a, [role="button"], input[type="button"], input[type="submit"]') ?? el;
  return withOverrides(el, "Table", { controlText: textOf(control) });
}

function recognizeButton(el: Element): RecognizedContext | null {
  const button = el.closest(
    'button, a, [role="button"], input[type="button"], input[type="submit"]'
  );
  return button ? withOverrides(button, "Button", { controlText: textOf(button) }) : null;
}

function withOverrides(
  el: Element,
  component: string,
  extra: Partial<RecognizedContext>
): RecognizedContext {
  const context: RecognizedContext = { component, ...extra };
  const control = nearestTrackAttribute(el, TRACK_ATTRIBUTES.control);
  if (control) context.control = control;
  const instanceName = nearestTrackAttribute(el, TRACK_ATTRIBUTES.name);
  if (instanceName) context.instanceName = instanceName;
  const row = rowInfo(el);
  if (row) context.row = row;
  return context;
}

function textOf(el: Element | null | undefined): string | undefined {
  if (!el) return undefined;
  let text = el.textContent ?? "";
  if (!text.trim() && el.tagName === "INPUT") {
    text = (el as HTMLInputElement).value ?? "";
  }
  const normalized = text.trim().replace(/\s+/g, " ");
  return normalized ? normalized.slice(0, MAX_TEXT) : undefined;
}

function labelTextFor(el: Element): string | undefined {
  const wrapping = el.closest("label");
  const wrappingText = wrapping ? plainText(wrapping) : undefined;
  if (wrappingText) return wrappingText;
  const id = el.getAttribute("id");
  if (id) {
    const byForText = textOf(el.ownerDocument.querySelector(`label[for="${id}"]`));
    if (byForText) return byForText;
  }
  return el.getAttribute("aria-label")?.trim() || el.getAttribute("name")?.trim() || undefined;
}

function isSwitchLike(el: Element): boolean {
  let node: Element | null = el;
  for (let depth = 0; node && depth < 4; depth += 1) {
    if (node.getAttribute("role") === "switch") return true;
    if (/switch/i.test(node.getAttribute("class") ?? "")) return true;
    node = node.parentElement;
  }
  return false;
}

function isSearchForm(form: Element, submitText: string | undefined): boolean {
  if (form.closest('[role="search"]')) return true;
  const hint = `${form.getAttribute("class") ?? ""} ${form.getAttribute("id") ?? ""}`;
  if (/search/i.test(hint)) return true;
  if (form.querySelector('input[type="search"]')) return true;
  return mapTextToAction(submitText) === EventAction.SEARCH;
}

function rowInfo(el: Element): RecognizedRow | undefined {
  const tr = el.closest("tr");
  const body = tr?.parentElement;
  if (!tr || !body || body.tagName !== "TBODY") return undefined;
  const rows = Array.from(body.children).filter((child) => child.tagName === "TR");
  const rowIndex = rows.indexOf(tr);
  if (rowIndex < 0) return undefined;
  const row: RecognizedRow = { rowIndex };
  const label = rowLabel(tr);
  if (label) row.rowLabel = label;
  return row;
}

function rowLabel(tr: Element): string | undefined {
  const cells = Array.from(tr.children).filter(
    (child) => child.tagName === "TD" || child.tagName === "TH"
  );
  const table = tr.closest("table");
  const override =
    tr.getAttribute(TRACK_ATTRIBUTES.rowLabel) ?? table?.getAttribute(TRACK_ATTRIBUTES.rowLabel);
  if (override) {
    const index = /^\d+$/.test(override.trim())
      ? Number(override.trim())
      : headerIndex(table, override.trim());
    if (index !== undefined && cells[index]) {
      const text = textOf(cells[index]);
      if (text) return text;
    }
  }
  for (const cell of cells) {
    const text = plainText(cell);
    if (text) return text;
  }
  return undefined;
}

function headerIndex(table: Element | null, headerName: string): number | undefined {
  if (!table) return undefined;
  const headers = Array.from(table.querySelectorAll("thead th, thead td"));
  for (let index = 0; index < headers.length; index += 1) {
    if (textOf(headers[index]) === headerName) return index;
  }
  return undefined;
}

function plainText(el: Element): string | undefined {
  const clone = el.cloneNode(true) as Element;
  for (const interactive of Array.from(
    clone.querySelectorAll('button, a, [role="button"], input, select, textarea')
  )) {
    interactive.remove();
  }
  return textOf(clone);
}
