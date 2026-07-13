import {
  EVENT_CATEGORY_SEGMENT_RE,
  EVENT_PATH_RE,
  EVENT_TYPES,
  type TrackEvent,
} from "../core/event";

/**
 * Local naming-convention linter. Violations never block the event: they are
 * console.warn'ed (with the [event-tracking] prefix) and returned as strings
 * so tests and the debug panel can inspect them.
 */

/** Validates one event and returns human-readable violation messages (empty = clean). */
export function lintEvent(event: TrackEvent): string[] {
  const violations: string[] = [];

  const ec = event.eventCategory;
  if (!ec) {
    violations.push("eventCategory 为空，应为 businessType_serviceName[_module]");
  } else {
    const segments = ec.split("_");
    if (segments.length < 2 || segments.length > 3) {
      violations.push(
        `eventCategory "${ec}" 应为 2-3 段下划线分隔（businessType_serviceName[_module]），实际 ${segments.length} 段`,
      );
    }
    for (const segment of segments) {
      if (segment === "") {
        violations.push(`eventCategory "${ec}" 含空段（连续/首尾下划线）`);
      } else if (!EVENT_CATEGORY_SEGMENT_RE.test(segment)) {
        violations.push(
          `eventCategory 段 "${segment}" 不符合命名建议（字母开头、仅字母数字、建议小驼峰）`,
        );
      }
    }
  }

  const et = event.eventType;
  if (!et) {
    violations.push("eventType 为空");
  } else if (!EVENT_TYPES.has(et)) {
    violations.push(`eventType "${et}" 不属于封闭事件类型（22 个 EventAction 或 EXPOSE）`);
  }

  const ep = event.eventPath;
  if (!ep) {
    violations.push("eventPath 为空，应为 组件[.实例].控件[:文本]");
  } else if (!EVENT_PATH_RE.test(ep)) {
    violations.push(`eventPath "${ep}" 不符合 组件[.实例].控件[:文本] 格式`);
  }

  if (event.eventCustom !== undefined) {
    try {
      JSON.stringify(event.eventCustom);
    } catch {
      violations.push("eventCustom 无法 JSON 序列化（含循环引用或 BigInt 等）");
    }
  }

  return violations;
}

export interface LintHookOptions {
  /** Override the warn sink (mainly for tests). Defaults to console.warn. */
  warn?: (message: string) => void;
}

/**
 * Pipeline hook factory for tracker.use(): lints every event, warns on
 * violations, and always passes the event through unmodified.
 */
export function createLintHook(options: LintHookOptions = {}): (event: TrackEvent) => TrackEvent {
  const warn =
    options.warn ??
    ((message: string) => {
      try {
        if (typeof console !== "undefined") console.warn(message);
      } catch {
        /* logging must not throw */
      }
    });
  return (event: TrackEvent): TrackEvent => {
    try {
      for (const violation of lintEvent(event)) {
        warn(`[event-tracking] lint: ${violation}`);
      }
    } catch {
      /* linting must never break the pipeline */
    }
    return event;
  };
}
