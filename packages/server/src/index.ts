import { createServer } from "node:http";

// Layer 3: owns the workspace files and runs tools. Tool endpoints land here.
const server = createServer((req, res) => {
  if (req.url === "/health") {
    res.end("ok");
    return;
  }
  res.statusCode = 404;
  res.end();
});

const port = Number(process.env.PORT ?? 8788);
server.listen(port, () => console.log(`server listening on :${port}`));
