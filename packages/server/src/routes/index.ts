import type { NodeExecutionEnv } from "@earendil-works/pi-durable/env/node";
import { execHandler } from "./exec.ts";
import { fsHandlers } from "./fs.ts";

/** Route path -> handler, keyed by the `ServerApi` paths. */
export const createRoutes = (root: string, env: NodeExecutionEnv) => ({
  ...fsHandlers(root, env),
  "/exec": execHandler(root, env),
});
