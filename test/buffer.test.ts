import { describe, expect, it } from "vitest";
import { EventBuffer } from "../src/core/buffer";
import type { TrackEvent } from "../src/core/event";

function event(path: string): TrackEvent {
  return { eventCategory: "biz_svc", eventType: "CLICK", eventPath: path };
}

describe("EventBuffer", () => {
  it("flushes buffered events in insertion order and empties itself", () => {
    const buffer = new EventBuffer();
    buffer.enqueue(event("a"));
    buffer.enqueue(event("b"));
    buffer.enqueue(event("c"));
    expect(buffer.size).toBe(3);

    const flushed: string[] = [];
    buffer.flush((e) => flushed.push(e.eventPath));
    expect(flushed).toEqual(["a", "b", "c"]);
    expect(buffer.size).toBe(0);

    buffer.flush(() => {
      throw new Error("should not be called on empty buffer");
    });
  });

  it("drops the oldest event when the limit is exceeded", () => {
    const buffer = new EventBuffer(3);
    for (const path of ["a", "b", "c", "d", "e"]) {
      buffer.enqueue(event(path));
    }
    expect(buffer.size).toBe(3);

    const flushed: string[] = [];
    buffer.flush((e) => flushed.push(e.eventPath));
    expect(flushed).toEqual(["c", "d", "e"]);
  });

  it("defaults to a 200-event limit", () => {
    const buffer = new EventBuffer();
    for (let i = 0; i < 250; i++) {
      buffer.enqueue(event(`e${i}`));
    }
    expect(buffer.size).toBe(200);
    const flushed: string[] = [];
    buffer.flush((e) => flushed.push(e.eventPath));
    expect(flushed[0]).toBe("e50");
    expect(flushed[flushed.length - 1]).toBe("e249");
  });
});
