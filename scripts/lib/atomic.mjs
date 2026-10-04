/**
 * Atomic write helper — tmp file + rename.
 * A crash mid-write can never leave a half-written artifact for git to commit.
 * (Order of Magnitude 3, finding 2: "pushing broken files, empty structures, or
 * half-parsed configurations into the main branch".)
 */

import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

export function atomicWrite(filePath, contents) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  writeFileSync(tmp, contents);
  renameSync(tmp, filePath);
}
