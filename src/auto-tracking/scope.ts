import { EventAction } from "../core/event";

const CLICKABLE_SELECTOR = [
  "button",
  "a",
  '[role="button"]',
  '[role="menuitem"]',
  '[role="tab"]',
  '[role="switch"]',
  'input[type="button"]',
  'input[type="submit"]',
].join(",");

const PAGINATION_CLASS = /pagin|pager/i;

export function findClickTarget(target: Element): Element | null {
  const direct = target.closest(CLICKABLE_SELECTOR);
  if (direct) return direct;
  const item = target.closest("li");
  return item && findPaginationContainer(item) ? item : null;
}

export function findPaginationContainer(el: Element): Element | null {
  let node: Element | null = el;
  while (node) {
    if (PAGINATION_CLASS.test(node.getAttribute("class") ?? "")) return node;
    if (node.tagName === "NAV") {
      const label = node.getAttribute("aria-label") ?? "";
      if (/page|pagin|分页/i.test(label)) return node;
    }
    node = node.parentElement;
  }
  return null;
}

export function isChangeInScope(el: Element): boolean {
  if (el.tagName === "SELECT") return true;
  if (el.tagName === "INPUT") {
    const type = (el as HTMLInputElement).type;
    return type === "checkbox" || type === "radio";
  }
  return false;
}

const TEXT_ACTION_RULES: Array<[RegExp, EventAction]> = [
  [/导出|下载|download|export/i, EventAction.DOWNLOAD],
  [/上传|upload/i, EventAction.UPLOAD],
  [/提交|保存|submit|save/i, EventAction.SUBMIT],
  [/搜索|查询|search|query/i, EventAction.SEARCH],
  [/刷新|refresh|reload/i, EventAction.REFRESH],
  [/确认|确定|confirm/i, EventAction.CONFIRM],
];

const MAX_VERB_TEXT = 20;

export function mapTextToAction(text: string | null | undefined): EventAction | undefined {
  if (!text) return undefined;
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > MAX_VERB_TEXT) return undefined;
  for (const [pattern, action] of TEXT_ACTION_RULES) {
    if (pattern.test(trimmed)) return action;
  }
  return undefined;
}
