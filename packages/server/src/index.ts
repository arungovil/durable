import { createApp } from "./app.ts";

// Layer 3: owns the workspace files and runs tools.
const workspace = process.env.WORKSPACE;
const token = process.env.TOKEN;
if (!workspace || !token) {
  console.error("WORKSPACE and TOKEN must be set");
  process.exit(1);
}

const port = Number(process.env.PORT ?? 8788);
const server = await createApp({ workspace, token });
server.listen(port, () => console.log(`server listening on :${port}`));
