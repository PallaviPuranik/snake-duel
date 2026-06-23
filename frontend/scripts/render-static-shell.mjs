import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(currentDir, "..");
const clientDistDir = path.join(frontendRoot, "dist", "client");
const serverEntryUrl = pathToFileURL(path.join(frontendRoot, "dist", "server", "server.js")).href;

const { default: server } = await import(serverEntryUrl);
const response = await server.fetch(new Request("http://snake-arena.local/"), {}, {});

if (!response.ok) {
  throw new Error(`Failed to render frontend shell: ${response.status} ${response.statusText}`);
}

await mkdir(clientDistDir, { recursive: true });
await writeFile(path.join(clientDistDir, "index.html"), await response.text(), "utf8");
