import type { PlatformAdapter } from "../core/ports";
import {
  ScriptPlatformAdapter,
  type ScriptAdapterOptions,
} from "./script-platform-adapter";

/** Options for the UEM adapter factory. */
export interface UemAdapterOptions extends ScriptAdapterOptions {}

class UemAdapter extends ScriptPlatformAdapter {
  readonly name = "uem";
  protected readonly defaultGlobalName = "UEM";

  constructor(options: UemAdapterOptions = {}) {
    super(options);
  }
}

/**
 * Factory used by the final wiring phase:
 * `init(config)` reads `config.platforms.uem` and calls
 * `registerAdapter(createUemAdapter(options))`.
 */
export function createUemAdapter(options: UemAdapterOptions = {}): PlatformAdapter {
  return new UemAdapter(options);
}
