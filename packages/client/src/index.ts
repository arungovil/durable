import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// Layer 1: pi extension. Connects the local pi session to a Cell over WebSocket.
export default function (pi: ExtensionAPI) {
  pi.registerCommand("pair", {
    description: "Join a shared Cell: /pair <url>",
    handler: async (args, ctx) => {
      ctx.ui.notify(`pair: not implemented yet (${args || "no url"})`, "info");
    },
  });
}
