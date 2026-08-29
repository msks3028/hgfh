import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

const root = process.cwd();
const isWindows = process.platform === "win32";
const processes = [];

// When this file is launched by `npm run dev`, npm exposes the exact
// npm CLI entry point through npm_execpath. Running that JS file directly
// with Node avoids Windows `npm.cmd`/spawn EINVAL issues (especially on Node 24).
function getNpmRunner() {
  if (process.platform === "win32") {
    // Use cmd.exe for child npm processes on Windows. This avoids
    // Node 24 spawn EINVAL errors caused by launching npm's JS entrypoint directly.
    return {
      command: process.env.ComSpec || "cmd.exe",
      wrap: (args) => ["/d", "/s", "/c", `npm ${args.join(" ")}`],
    };
  }

  return { command: "npm", wrap: (args) => args };
}

const npm = getNpmRunner();

function run(name, npmArgs, cwd) {
  const child = spawn(npm.command, npm.wrap(npmArgs), {
    cwd,
    stdio: "inherit",
    env: { ...process.env },
    windowsHide: false,
  });

  processes.push(child);

  child.on("error", (err) => {
    console.error(`[${name}] failed to start: ${err.message}`);
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      console.log(`[${name}] stopped by ${signal}`);
    } else if (code && code !== 0) {
      console.error(`[${name}] stopped with code ${code}`);
    }
  });

  return child;
}

console.log("\nLurnova development mode: Backend + Frontend");
console.log("Backend:  http://localhost:5000");
console.log("Frontend: http://localhost:5173\n");

run("backend", ["start"], path.join(root, "server"));
run("frontend", ["run", "dev:frontend"], root);

function shutdown() {
  for (const child of processes) {
    if (!child || child.killed || !child.pid) continue;

    try {
      if (isWindows) {
        // taskkill is only used during shutdown; it does not participate in
        // startup, so it cannot trigger the Windows spawn EINVAL issue.
        spawn(process.env.ComSpec || "cmd.exe", [
          "/d",
          "/c",
          "taskkill",
          "/pid",
          String(child.pid),
          "/T",
          "/F",
        ], {
          stdio: "ignore",
          windowsHide: true,
        });
      } else {
        child.kill("SIGTERM");
      }
    } catch {
      // Ignore shutdown errors.
    }
  }
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
