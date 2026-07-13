import { defineConfig } from "tsup";
import pkg from "./package.json" with { type: "json" };

// Fixed-version delivery: output filename carries the package version so
// host systems pin an exact build (e.g. <script src=".../event-tracking.v1.0.0.js">).
export default defineConfig([
  {
    entry: { [`event-tracking.v${pkg.version}`]: "src/index.ts" },
    format: ["iife"],
    globalName: "EventTracking",
    dts: false,
    sourcemap: false,
    clean: true,
    minify: false,
    target: "es2018",
    outExtension: () => ({ js: ".js" }),
  },
  {
    entry: { "event-tracking.esm": "src/index.ts" },
    format: ["esm"],
    dts: { entry: { index: "src/index.ts" } },
    sourcemap: false,
    clean: false,
    target: "es2018",
    outExtension: () => ({ js: ".js" }),
  },
]);
