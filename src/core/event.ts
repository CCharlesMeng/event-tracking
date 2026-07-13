/**
 * Unified event model. All tracking data — auto-captured or manual — is
 * normalized into a TrackEvent before it reaches the report router.
 */
export interface TrackEvent {
  /** e.g. `biz_orderService_orderList` = businessType_serviceName[_module] */
  eventCategory: string;
  /** One of the 22 interaction actions, or the reserved SDK exposure action. */
  eventType: EventType;
  /** e.g. `Table.订单列表.导出` — component[.instance].control[:text] */
  eventPath: string;
  eventValue?: string | number;
  eventCustom?: Record<string, unknown>;
}

/** The 22 canonical event actions agreed in the spec. */
export enum EventAction {
  INIT = "INIT",
  CLICK = "CLICK",
  SEARCH = "SEARCH",
  ON = "ON",
  OFF = "OFF",
  SELECT = "SELECT",
  CHECK = "CHECK",
  UNCHECK = "UNCHECK",
  REFRESH = "REFRESH",
  BLUR = "BLUR",
  DOWNLOAD = "DOWNLOAD",
  BATCH = "BATCH",
  HOVER = "HOVER",
  SLIDE = "SLIDE",
  ADD = "ADD",
  REDUCE = "REDUCE",
  DRAG = "DRAG",
  CHANGE = "CHANGE",
  SUBMIT = "SUBMIT",
  FOCUS = "FOCUS",
  UPLOAD = "UPLOAD",
  CONFIRM = "CONFIRM",
}

/** SDK-owned non-interaction actions. Integrations cannot add arbitrary event types. */
export enum SystemEventAction {
  EXPOSE = "EXPOSE",
}

export type EventType = `${EventAction}` | `${SystemEventAction}`;

export const EVENT_TYPES: ReadonlySet<string> = new Set([
  ...Object.values(EventAction),
  ...Object.values(SystemEventAction),
]);

export const EVENT_CATEGORY_SEGMENT_RE = /^[a-zA-Z][a-zA-Z0-9]*$/;
export const EVENT_PATH_RE = /^[^.:\s][^.:]*(\.[^.:]+)*(:.+)?$/;

export function isValidIdentitySegment(value: unknown): value is string {
  return typeof value === "string" && EVENT_CATEGORY_SEGMENT_RE.test(value);
}

export function isValidEventCategory(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const segments = value.split("_");
  return (
    segments.length >= 2 &&
    segments.length <= 3 &&
    segments.every((segment) => isValidIdentitySegment(segment))
  );
}

export function isValidEventType(value: unknown): value is EventType {
  return typeof value === "string" && EVENT_TYPES.has(value);
}

export function isValidEventPath(value: unknown): value is string {
  return typeof value === "string" && EVENT_PATH_RE.test(value);
}

function isSerializable(value: unknown): boolean {
  try {
    JSON.stringify(value);
    return true;
  } catch {
    return false;
  }
}

/** Runtime boundary validation used before an event can reach any platform. */
export function validateTrackEvent(event: TrackEvent): string | null {
  if (!isValidEventCategory(event.eventCategory)) return "invalid-event-category";
  if (!isValidEventType(event.eventType)) return "invalid-event-type";
  if (!isValidEventPath(event.eventPath)) return "invalid-event-path";
  if (
    event.eventValue !== undefined &&
    !(
      typeof event.eventValue === "string" ||
      (typeof event.eventValue === "number" && Number.isFinite(event.eventValue))
    )
  ) {
    return "invalid-event-value";
  }
  if (
    event.eventCustom !== undefined &&
    (event.eventCustom === null ||
      typeof event.eventCustom !== "object" ||
      !isSerializable(event.eventCustom))
  ) {
    return "invalid-event-custom";
  }
  return null;
}
