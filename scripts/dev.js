import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const viteBin = path.join(rootDir, "node_modules", "vite", "bin", "vite.js");
const processes = [];

function isPortAvailable(port, host) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, host);
  });
}

function start(label, args) {
  const child = spawn(process.execPath, args, {
    cwd: rootDir,
    stdio: "inherit",
  });
  child.label = label;
  processes.push(child);
  return child;
}

function stopAll(signal = "SIGTERM") {
  for (const child of processes) {
    if (!child.killed) child.kill(signal);
  }
}

process.on("SIGINT", () => {
  stopAll("SIGINT");
  process.exit(0);
});

process.on("SIGTERM", () => {
  stopAll("SIGTERM");
  process.exit(0);
});

if (await isPortAvailable(3001, "0.0.0.0")) {
  start("server", ["server.js"]);
} else {
  console.log("Port 3001 is already in use; using the existing multiplayer server.");
}

start("client", [viteBin, "--host", "0.0.0.0"]);

for (const child of processes) {
  child.on("exit", (code) => {
    if (code && code !== 0) {
      stopAll();
      process.exit(code);
    }
  });
}
