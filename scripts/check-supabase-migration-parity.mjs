import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const migrationsDir = path.join(root, "supabase", "migrations");
const supabaseBin = process.env.SUPABASE_BIN || "supabase";

function listLocalMigrations() {
  return fs
    .readdirSync(migrationsDir)
    .filter((file) => /^\d{14}_.+\.sql$/.test(file))
    .sort()
    .map((file) => ({ file, id: file.slice(0, 14) }));
}

function parseMigrationList(output) {
  const rows = [];
  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();
    const match = line.match(/^(\d{14})\s*\|\s*(\d{14})?\s*\|/);
    if (!match) continue;
    rows.push({
      local: match[1],
      remote: match[2] || null,
    });
  }
  return rows;
}

function runMigrationList() {
  try {
    return execSync(`${supabaseBin} migration list`, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to run \`${supabaseBin} migration list\`: ${message}`);
  }
}

const localMigrations = listLocalMigrations();
const output = runMigrationList();
const remoteRows = parseMigrationList(output);

const remoteAppliedIds = new Set(remoteRows.filter((row) => row.remote).map((row) => row.remote));
const localIds = new Set(localMigrations.map((migration) => migration.id));
const missingOnRemote = localMigrations.filter((migration) => !remoteAppliedIds.has(migration.id));
const remoteOnly = [...remoteAppliedIds].filter((id) => !localIds.has(id));

console.log(`Local migrations: ${localMigrations.length}`);
console.log(`Remote applied migrations: ${remoteAppliedIds.size}`);

if (missingOnRemote.length > 0) {
  console.log("");
  console.log("Local migrations not yet applied remotely:");
  for (const migration of missingOnRemote) {
    console.log(`- ${migration.file}`);
  }
}

if (remoteOnly.length > 0) {
  console.log("");
  console.log("Remote migrations not present locally:");
  for (const id of remoteOnly) {
    console.log(`- ${id}`);
  }
}

if (missingOnRemote.length > 0 || remoteOnly.length > 0) {
  console.log("");
  console.log("Supabase migration parity check failed.");
  process.exitCode = 1;
} else {
  console.log("");
  console.log("Supabase migration parity looks aligned.");
}
