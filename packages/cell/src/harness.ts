import type { Models } from "@earendil-works/pi-ai";
import {
  createRegistry,
  type HarnessOptions,
} from "@earendil-works/pi-durable";
import { CodingTools } from "@earendil-works/pi-durable/tools";
import { HttpExecutionEnv, type HttpExecutionEnvOptions } from "./http-env.ts";

/**
 * Harness options shared by the Cell and its tests, free of `cloudflare:workers` so Node can import it.
 * Tools run on the Server; the conversation's `cwd` overrides `server.cwd` when set.
 */
export function harnessOptions(
  models: Models,
  server: HttpExecutionEnvOptions,
): HarnessOptions {
  const registry = createRegistry();
  registry.install(CodingTools);
  return {
    models,
    registry,
    env: ({ cwd }) =>
      new HttpExecutionEnv({ ...server, cwd: cwd ?? server.cwd }),
  };
}
