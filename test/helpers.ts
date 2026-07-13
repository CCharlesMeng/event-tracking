import type {
  PlatformAdapter,
  PlatformSdkContract,
  PlatformSdkInstance,
} from "../src/core/ports";
import type { TrackEvent } from "../src/core/event";
import type { InitConfig } from "../src/config";

export interface FakeAdapter extends PlatformAdapter {
  reported: TrackEvent[];
  setupConfig: InitConfig | null;
  ready: boolean;
}

export function fakeAdapter(name: string, ready = true): FakeAdapter {
  const adapter: FakeAdapter = {
    name,
    reported: [],
    setupConfig: null,
    ready,
    setup(config) {
      adapter.setupConfig = config;
    },
    isReady() {
      return adapter.ready;
    },
    report(event) {
      adapter.reported.push(event);
    },
  };
  return adapter;
}

/** Explicit test-only SDK contract; production integrations must use vendor docs. */
export function fakePlatformContract(methodName: string): PlatformSdkContract {
  const method = (instance: PlatformSdkInstance): ((payload: unknown) => void) | null => {
    if (typeof instance === "function") return null;
    const candidate = instance[methodName];
    return typeof candidate === "function"
      ? (candidate as (payload: unknown) => void)
      : null;
  };
  return {
    isReady: (instance) => method(instance) !== null,
    report(instance, event, context) {
      const report = method(instance);
      if (!report) throw new Error(`fixture method missing: ${methodName}`);
      report.call(instance, {
        ...event,
        ...(context.appId === undefined ? {} : { appId: context.appId }),
      });
    },
  };
}
