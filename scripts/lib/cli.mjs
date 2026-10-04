/**
 * CLI entry guard: run main() only when the module is invoked directly,
 * so tests can import the module's exported helpers without side effects.
 */

import { realpathSync } from "node:fs";

export function runIfMain(metaUrl, main) {
  if (!process.argv[1]) return;
  try {
    const invoked = new URL(`file://${realpathSync(process.argv[1])}`).href;
    if (invoked === metaUrl) main();
  } catch {
    // argv[1] not a real file (e.g. piped eval) — do nothing.
  }
}
