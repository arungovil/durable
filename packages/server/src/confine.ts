import { realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import type { ServerError } from "@durable/protocol";
import type { Result } from "@earendil-works/pi-durable/env";
import { fail } from "./result.ts";

/**
 * Resolves `path` against the workspace and rejects anything that lands outside it, including through symlinks.
 * The deepest existing ancestor is resolved with realpath, so a not-yet-created file is checked by its parent.
 * `root` must already be a realpath.
 */
export async function confine(
  root: string,
  path: string,
): Promise<Result<string, ServerError>> {
  const abs = resolve(root, path);
  let probe = abs;
  for (;;) {
    try {
      const real = await realpath(probe);
      const rel = relative(root, real);
      if (rel.startsWith("..") || isAbsolute(rel)) break;
      return { ok: true, value: abs };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") break;
      const parent = dirname(probe);
      if (parent === probe) break;
      probe = parent;
    }
  }
  return fail("permission_denied", "path is outside the workspace", path);
}
