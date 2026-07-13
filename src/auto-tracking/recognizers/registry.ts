import type { EventAction } from "../../core/event";
import { genericDomRecognizer } from "./generic-dom";

export interface RecognizedRow {
  rowIndex: number;
  rowLabel?: string;
}

export interface RecognizedContext {
  component: string;
  instanceName?: string;
  control?: string;
  controlText?: string;
  row?: RecognizedRow;
  action?: EventAction;
}

export interface Recognizer {
  readonly name: string;
  recognize(target: Element): RecognizedContext | null;
  /** Optional cleanup invoked once when this registration is removed. */
  teardown?(): void;
}

export interface RegisterRecognizerOptions {
  /** Higher values run first; equal priorities retain registration order. */
  priority?: number;
}

export interface RecognizerRegistration {
  readonly name: string;
  /** False when validation or a duplicate name rejected the registration. */
  readonly registered: boolean;
  /** Idempotently removes this exact registration and runs its teardown. */
  unregister(): boolean;
}

interface RegisteredRecognizer {
  recognizer: Recognizer;
  priority: number;
  order: number;
}

const registered: RegisteredRecognizer[] = [];
let registrationOrder = 0;

/**
 * Register a component-library recognizer.
 *
 * Names are unique, duplicates are rejected without replacing the existing
 * recognizer, and the generic DOM recognizer is permanently reserved as the
 * final fallback. Invalid registration attempts never throw into the host.
 */
export function registerRecognizer(
  recognizer: Recognizer,
  options: RegisterRecognizerOptions = {},
): RecognizerRegistration {
  const name = validName(recognizer?.name);
  const priority = finitePriority(options.priority);
  if (
    !name ||
    name === genericDomRecognizer.name ||
    typeof recognizer?.recognize !== "function" ||
    registered.some((entry) => entry.recognizer.name === name)
  ) {
    return rejectedRegistration(name ?? "");
  }

  const entry: RegisteredRecognizer = {
    recognizer,
    priority,
    order: registrationOrder++,
  };
  registered.push(entry);
  return {
    name,
    get registered() {
      return registered.includes(entry);
    },
    unregister() {
      return removeEntry(entry);
    },
  };
}

/** Remove a named recognizer and run its teardown; returns whether it existed. */
export function unregisterRecognizer(name: string): boolean {
  const entry = registered.find((candidate) => candidate.recognizer.name === name);
  return entry ? removeEntry(entry) : false;
}

/** Registered recognizers by priority followed by the generic DOM fallback. */
export function getRecognizers(): Recognizer[] {
  return [
    ...registered
      .slice()
      .sort((left, right) => right.priority - left.priority || left.order - right.order)
      .map((entry) => entry.recognizer),
    genericDomRecognizer,
  ];
}

export function runRecognizers(target: Element): RecognizedContext | null {
  for (const recognizer of getRecognizers()) {
    try {
      const context = recognizer.recognize(target);
      if (context) return context;
    } catch {
      /* skip a broken recognizer */
    }
  }
  return null;
}

function removeEntry(entry: RegisteredRecognizer): boolean {
  const index = registered.indexOf(entry);
  if (index < 0) return false;
  registered.splice(index, 1);
  try {
    entry.recognizer.teardown?.();
  } catch {
    /* teardown must never throw into the host */
  }
  return true;
}

function rejectedRegistration(name: string): RecognizerRegistration {
  return {
    name,
    registered: false,
    unregister: () => false,
  };
}

function validName(name: unknown): string | null {
  return typeof name === "string" && name.trim() === name && name.length > 0
    ? name
    : null;
}

function finitePriority(priority: number | undefined): number {
  return typeof priority === "number" && Number.isFinite(priority) ? priority : 0;
}
