import { SystemEventAction, type TrackEvent } from "../core/event";

export type ErrorStateType = "error" | "empty" | "forbidden";

export interface WatchErrorStatesOptions {
  track: (event: Partial<TrackEvent>) => void;
  root?: Element | Document;
  throttleMs?: number;
}

export interface ErrorStateWatcher {
  stop(): void;
}

const BATCH_MS = 500;
const TEXT_MATCH_MAX_LENGTH = 60;
const REPORT_TEXT_MAX_LENGTH = 100;

const STATE_PATH_LABEL: Record<ErrorStateType, string> = {
  empty: "空态",
  error: "错误",
  forbidden: "无权限",
};

const CLASS_RULES: Array<[ErrorStateType, RegExp]> = [
  ["forbidden", /forbidden|no-?permission|403/i],
  ["empty", /empty|no-?data/i],
  ["error", /error|fail/i],
];

const TEXT_RULES: Array<[ErrorStateType, RegExp]> = [
  ["forbidden", /无权限|暂无权限|403|forbidden/i],
  ["empty", /暂无数据|无数据|暂无内容|empty/i],
  ["error", /错误|出错|加载失败|请求失败|error/i],
];

function classifyElement(el: Element): ErrorStateType | null {
  const className = typeof el.className === "string" ? el.className : "";
  for (const [type, pattern] of CLASS_RULES) {
    if (pattern.test(className)) return type;
  }
  const text = (el.textContent ?? "").trim();
  if (text && text.length <= TEXT_MATCH_MAX_LENGTH) {
    for (const [type, pattern] of TEXT_RULES) {
      if (pattern.test(text)) return type;
    }
  }
  return null;
}

export function watchErrorStates(options: WatchErrorStatesOptions): ErrorStateWatcher {
  const throttleMs = options.throttleMs ?? BATCH_MS;
  const reported = new WeakSet<Element>();
  const pending = new Set<Element>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  let observer: MutationObserver | null = null;

  const report = (el: Element, stateType: ErrorStateType) => {
    try {
      const text = (el.textContent ?? "").trim().slice(0, REPORT_TEXT_MAX_LENGTH);
      options.track({
        eventType: SystemEventAction.EXPOSE,
        eventPath: `ErrorState.${STATE_PATH_LABEL[stateType]}`,
        eventCustom: { stateType, text },
      });
    } catch {
      /* silent */
    }
  };

  const scan = (el: Element) => {
    const isPageContainer = el.tagName === "BODY" || el.tagName === "HTML";
    const stateType = isPageContainer ? null : classifyElement(el);
    if (stateType) {
      if (!reported.has(el)) {
        reported.add(el);
        report(el, stateType);
      }
      return;
    }
    for (let index = 0; index < el.children.length; index += 1) {
      scan(el.children[index]);
    }
  };

  const hasReportedAncestor = (el: Element): boolean => {
    let current: Element | null = el;
    while (current) {
      if (reported.has(current)) return true;
      current = current.parentElement;
    }
    return false;
  };

  const flush = () => {
    timer = null;
    if (stopped) return;
    const batch = Array.from(pending);
    pending.clear();
    for (const el of batch) {
      try {
        if (el.isConnected && !hasReportedAncestor(el)) scan(el);
      } catch {
        /* silent */
      }
    }
  };

  const schedule = () => {
    if (timer === null && !stopped) timer = setTimeout(flush, throttleMs);
  };

  try {
    const root = options.root ?? document;
    const rootElement = root instanceof Document ? root.documentElement : root;
    observer = new MutationObserver((mutations) => {
      try {
        for (const mutation of mutations) {
          for (let index = 0; index < mutation.addedNodes.length; index += 1) {
            const node = mutation.addedNodes[index];
            if (node instanceof Element) pending.add(node);
          }
          if (mutation.type !== "childList" && mutation.target instanceof Element) {
            pending.add(mutation.target);
          }
        }
        if (pending.size > 0) schedule();
      } catch {
        /* silent */
      }
    });
    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class"],
    });
    if (rootElement) {
      pending.add(rootElement);
      schedule();
    }
  } catch {
    /* watcher becomes a no-op */
  }

  return {
    stop() {
      try {
        stopped = true;
        observer?.disconnect();
        observer = null;
        if (timer !== null) {
          clearTimeout(timer);
          timer = null;
        }
        pending.clear();
      } catch {
        /* silent */
      }
    },
  };
}
