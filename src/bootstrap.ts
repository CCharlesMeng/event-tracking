import { createFurionAdapter } from "./adapters/furion";
import { createUemAdapter } from "./adapters/uem";
import {
  startAutoTrack,
  stopAutoTrack,
  type AutoTrackHandle,
} from "./auto-tracking/delegator";
import {
  watchErrorStates,
  type ErrorStateWatcher,
} from "./auto-tracking/error-state";
import { inferModule } from "./auto-tracking/inference";
import { validateInitConfig, type InitConfig, type PlatformConfig } from "./config";
import type { Tracker } from "./core/tracker";
import { createLintHook } from "./devtools/lint";
import { mountDebugPanel, type DebugPanelHandle } from "./devtools/panel";
import { createMaskHook } from "./privacy/mask";

export interface WiredSdk {
  init(config: InitConfig): void;
  destroy(): void;
}

function adapterOptions(platform: PlatformConfig, debug: boolean | undefined) {
  return {
    contract: platform.contract,
    script: platform.script,
    cdnUrl: platform.cdnUrl,
    globalName: platform.globalName,
    appId: platform.appId,
    debug,
  };
}

/**
 * Composition root for adapters, privacy, inference, auto-tracking and
 * development tools. Optional modules are isolated so they cannot block init.
 */
export function wireTracker(tracker: Tracker): WiredSdk {
  let panel: DebugPanelHandle | null = null;
  let errorWatcher: ErrorStateWatcher | null = null;
  let autoTracking: AutoTrackHandle | null = null;

  const init = (config: InitConfig): void => {
    if (tracker.getConfig()) {
      tracker.init(config);
      return;
    }
    if (validateInitConfig(config)) {
      tracker.init(config);
      return;
    }

    try {
      const furion = config.platforms?.furion;
      if (furion && furion.enabled !== false) {
        tracker.registerAdapter(createFurionAdapter(adapterOptions(furion, config.debug)));
      }
      const uem = config.platforms?.uem;
      if (uem && uem.enabled !== false) {
        tracker.registerAdapter(createUemAdapter(adapterOptions(uem, config.debug)));
      }
    } catch {
      /* a failing adapter factory must not block init */
    }

    try {
      tracker.use(
        createMaskHook({
          fieldBlacklist: config.fieldBlacklist,
          onError: () => {
            tracker.recordDiagnostic("internalErrors", "mask-failure");
            tracker.recordDiagnostic("droppedEvents", "mask-failure");
          },
        }),
      );
    } catch {
      /* silent */
    }

    try {
      tracker.setModuleInferrer(inferModule);
    } catch {
      /* silent */
    }

    if (config.debug) {
      try {
        tracker.use(createLintHook());
      } catch {
        /* silent */
      }
    }

    tracker.init(config);
    const resolved = tracker.getConfig();
    if (!resolved) return;

    if (resolved.debug) {
      try {
        panel = mountDebugPanel({ subscribe: (listener) => tracker.onDispatch(listener) });
      } catch {
        /* silent */
      }
    }

    if (resolved.autoTrack) {
      try {
        autoTracking = startAutoTrack({ track: (event) => tracker.track(event) });
      } catch {
        /* silent */
      }
    }

    if (resolved.trackErrorStates) {
      try {
        errorWatcher = watchErrorStates({ track: (event) => tracker.track(event) });
      } catch {
        /* silent */
      }
    }
  };

  const destroy = (): void => {
    try {
      if (autoTracking) {
        stopAutoTrack(autoTracking);
        autoTracking = null;
      }
    } catch {
      /* silent */
    }
    try {
      panel?.unmount();
      panel = null;
    } catch {
      /* silent */
    }
    try {
      errorWatcher?.stop();
      errorWatcher = null;
    } catch {
      /* silent */
    }
    try {
      tracker.destroy();
    } catch {
      /* silent */
    }
  };

  return { init, destroy };
}
