/** Central contract for integration-supplied DOM semantic overrides. */
export const TRACK_ATTRIBUTES = {
  name: "data-track-name",
  control: "data-track-control",
  module: "data-track-module",
  rowLabel: "data-track-row-label",
  ignore: "data-track-ignore",
} as const;

export type TrackAttribute = (typeof TRACK_ATTRIBUTES)[keyof typeof TRACK_ATTRIBUTES];

export function attributeSelector(attribute: TrackAttribute): string {
  return `[${attribute}]`;
}

/** Nearest non-empty value wins; empty values are treated as absent. */
export function nearestTrackAttribute(
  element: Element,
  attribute: TrackAttribute,
): string | undefined {
  return (
    element.closest(attributeSelector(attribute))?.getAttribute(attribute)?.trim() || undefined
  );
}

export function hasIgnoredAncestor(element: Element): boolean {
  return element.closest(attributeSelector(TRACK_ATTRIBUTES.ignore)) !== null;
}
