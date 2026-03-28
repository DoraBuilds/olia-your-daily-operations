import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

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

function runRetryable(command) {
  try {
    run(command);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      message.includes("already running") ||
      message.includes("not ready: starting") ||
      message.includes("Command failed: supabase start")
    ) {
      return false;
    }
    throw error;
  }
}

async function waitForSupabaseReady(timeoutMs = 60_000) {
  const startedAt = Date.now();
  let lastError = null;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const output = execSync("supabase status -o env", { encoding: "utf8", env: process.env });
      loadShellEnv(output);
      if (process.env.API_URL && process.env.ANON_KEY && process.env.SERVICE_ROLE_KEY) {
        return;
      }
      lastError = new Error("Supabase status is missing required env output.");
    } catch (error) {
      lastError = error;
    }

    await delay(2000);
  }

  throw lastError ?? new Error("Timed out waiting for local Supabase to become ready.");
}

loadEnvFile(envDockerPath);
run(`${bunBin} run env:local`);
if (!runRetryable("supabase start")) {
  await waitForSupabaseReady();
}
run("supabase db reset --local --no-seed");
await waitForSupabaseReady();

process.env.VITE_SUPABASE_URL ||= process.env.API_URL;
process.env.VITE_SUPABASE_ANON_KEY ||= process.env.ANON_KEY;
process.env.SUPABASE_SERVICE_ROLE_KEY ||= process.env.SERVICE_ROLE_KEY;

run(`${bunBin} scripts/seed-local-supabase.mjs`);
run(`${bunBin} x vitest run --config vitest.integration.config.ts`);
