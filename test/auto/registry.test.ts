import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getRecognizers,
  registerRecognizer,
  runRecognizers,
  unregisterRecognizer,
  type RecognizerRegistration,
} from "../../src/auto-tracking/recognizers/registry";

const registrations: RecognizerRegistration[] = [];

afterEach(() => {
  for (const registration of registrations.splice(0)) {
    registration.unregister();
  }
});

describe("component-library recognizer registry", () => {
  it("orders higher priorities first, preserves ties and keeps generic last", () => {
    registrations.push(
      registerRecognizer(
        { name: "fixture-low", recognize: () => ({ component: "Low" }) },
        { priority: 1 },
      ),
      registerRecognizer(
        { name: "fixture-high-first", recognize: () => ({ component: "HighFirst" }) },
        { priority: 10 },
      ),
      registerRecognizer(
        { name: "fixture-high-second", recognize: () => ({ component: "HighSecond" }) },
        { priority: 10 },
      ),
    );

    expect(getRecognizers().map((recognizer) => recognizer.name)).toEqual([
      "fixture-high-first",
      "fixture-high-second",
      "fixture-low",
      "generic",
    ]);
    expect(runRecognizers(document.body)?.component).toBe("HighFirst");
  });

  it("rejects duplicate and reserved names without replacing the first registration", () => {
    const first = registerRecognizer({
      name: "fixture-unique",
      recognize: () => ({ component: "First" }),
    });
    const duplicate = registerRecognizer({
      name: "fixture-unique",
      recognize: () => ({ component: "Duplicate" }),
    });
    const reserved = registerRecognizer({
      name: "generic",
      recognize: () => ({ component: "Replacement" }),
    });
    registrations.push(first, duplicate, reserved);

    expect(first.registered).toBe(true);
    expect(duplicate.registered).toBe(false);
    expect(reserved.registered).toBe(false);
    expect(runRecognizers(document.body)?.component).toBe("First");
  });

  it("supports idempotent handle and name unregistration with one teardown", () => {
    const teardown = vi.fn();
    const registration = registerRecognizer({
      name: "fixture-teardown",
      recognize: () => null,
      teardown,
    });
    registrations.push(registration);

    expect(unregisterRecognizer("fixture-teardown")).toBe(true);
    expect(registration.registered).toBe(false);
    expect(registration.unregister()).toBe(false);
    expect(unregisterRecognizer("fixture-teardown")).toBe(false);
    expect(teardown).toHaveBeenCalledOnce();
  });

  it("isolates recognizer and teardown failures from the host", () => {
    const registration = registerRecognizer({
      name: "fixture-throws",
      recognize: () => {
        throw new Error("recognizer failed");
      },
      teardown: () => {
        throw new Error("teardown failed");
      },
    });
    registrations.push(registration);

    const button = document.createElement("button");
    button.textContent = "保存";
    expect(() => runRecognizers(button)).not.toThrow();
    expect(runRecognizers(button)?.component).toBe("Button");
    expect(() => registration.unregister()).not.toThrow();
  });
});
