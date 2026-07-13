import type { PlatformAdapter } from "../core/ports";
import {
  ScriptPlatformAdapter,
  type ScriptAdapterOptions,
} from "./script-platform-adapter";

/** Options for the Furion adapter factory. */
export interface FurionAdapterOptions extends ScriptAdapterOptions {}

class FurionAdapter extends ScriptPlatformAdapter {
  readonly name = "furion";
  protected readonly defaultGlobalName = "Furion";

  constructor(options: FurionAdapterOptions = {}) {
    super(options);
  }
}

/**
 * Factory used by the final wiring phase:
 * `init(config)` reads `config.platforms.furion` and calls
 * `registerAdapter(createFurionAdapter(options))`.
 */
export function createFurionAdapter(options: FurionAdapterOptions = {}): PlatformAdapter {
  return new FurionAdapter(options);
}
