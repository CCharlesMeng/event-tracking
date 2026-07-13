import type { TrackEvent } from "./event";

export const DEFAULT_BUFFER_LIMIT = 200;

/**
 * Bounded FIFO buffer for events produced before a consumer is ready
 * (platform SDK still loading, or track() called before init()).
 * When full, the oldest event is dropped — never block or grow unbounded.
 */
export class EventBuffer<T = TrackEvent> {
  private queue: T[] = [];

  constructor(private readonly limit: number = DEFAULT_BUFFER_LIMIT) {}

  /** Enqueue and report whether the oldest item had to be discarded. */
  enqueue(event: T): boolean {
    let overflowed = false;
    if (this.queue.length >= this.limit) {
      this.queue.shift();
      overflowed = true;
    }
    this.queue.push(event);
    return overflowed;
  }

  /** Drain all buffered events into `consume`, in insertion order. */
  flush(consume: (event: T) => void): void {
    const pending = this.queue;
    this.queue = [];
    for (const event of pending) {
      consume(event);
    }
  }

  get size(): number {
    return this.queue.length;
  }

  clear(): number {
    const removed = this.queue.length;
    this.queue = [];
    return removed;
  }
}
