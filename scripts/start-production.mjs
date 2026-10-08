import path from "node:path";
import { fileURLToPath } from "node:url";

import { startProdServer } from "../vendor/vinext/dist/server/prod-server.js";

const runtimeDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const host = process.env.HOST ?? "127.0.0.1";

console.log(`Personal CFO is starting at http://${host}:${port}`);
await startProdServer({
  port,
  host,
  outDir: path.join(runtimeDir, "dist"),
});
