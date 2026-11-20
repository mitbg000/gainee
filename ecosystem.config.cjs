/**
 * PM2 process file – used on aaPanel (or any server with PM2).
 *   pm2 startOrReload ecosystem.config.cjs --update-env && pm2 save
 * Both processes read their configuration from ./.env
 */
const fs = require("node:fs");
const path = require("node:path");

function loadEnv(file) {
  const env = {};
  if (!fs.existsSync(file)) return env;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    env[m[1]] = v;
  }
  return env;
}

const env = { NODE_ENV: "production", ...loadEnv(path.join(__dirname, ".env")) };
const port = env.PORT || "3000";

module.exports = {
  apps: [
    {
      name: "readlearn-web",
      cwd: __dirname,
      script: "node_modules/next/dist/bin/next",
      args: `start -p ${port} -H 127.0.0.1`,
      env,
      instances: 1,
      exec_mode: "fork",
      max_memory_restart: "700M",
      time: true,
    },
    {
      name: "readlearn-worker",
      cwd: __dirname,
      script: "dist/worker.js",
      env,
      instances: 1, // keep a single worker
      exec_mode: "fork",
      max_memory_restart: "400M",
      kill_timeout: 5000,
      time: true,
    },
  ],
};
