import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const envDockerPath = path.join(root, ".env.docker");
const bunBin = process.env.BUN_BIN || path.join(process.env.HOME || "", ".bun/bin/bun");

if (!fs.existsSync(envDockerPath)) {
  throw new Error("Missing .env.docker. Create it first, then rerun the integration test command.");
}

function loadEnvFile(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim().replace(/^"|"$/g, "");
    process.env[key] = value;
  }
}

function loadShellEnv(output) {
  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim().replace(/^"|"$/g, "");
    process.env[key] = value;
  }
}

function run(command) {
  execSync(command, { stdio: "inherit", env: process.env });
}

loadEnvFile(envDockerPath);
run(`${bunBin} run env:local`);
run("supabase start");
run("supabase db reset --local --no-seed");
loadShellEnv(execSync("supabase status -o env", { encoding: "utf8" }));

process.env.VITE_SUPABASE_URL ||= process.env.API_URL;
process.env.VITE_SUPABASE_ANON_KEY ||= process.env.ANON_KEY;
process.env.SUPABASE_SERVICE_ROLE_KEY ||= process.env.SERVICE_ROLE_KEY;

run(`${bunBin} scripts/seed-local-supabase.mjs`);
run(`${bunBin} x vitest run --config vitest.integration.config.ts`);
