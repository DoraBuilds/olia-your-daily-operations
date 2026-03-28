#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const projectRefPath = path.join(repoRoot, "supabase", ".temp", "project-ref");
const projectRef = process.env.SUPABASE_PROJECT_REF ?? readTrimmedFile(projectRefPath);
const requireSender = process.argv.includes("--require-sender");

if (!projectRef) {
  console.error("Could not determine the Supabase project ref. Set SUPABASE_PROJECT_REF or link the project first.");
  process.exit(1);
}

const secrets = runSupabaseJson(["secrets", "list", "--project-ref", projectRef, "--output", "json"]);
const functions = runSupabaseJson(["functions", "list", "--project-ref", projectRef, "--output", "json"]);

const secretNames = new Set(secrets.map((entry) => entry.name));
const requiredSecrets = ["RESEND_API_KEY", "ALERT_SECRET"];
const missingRequiredSecrets = requiredSecrets.filter((name) => !secretNames.has(name));
const hasSenderSecret = secretNames.has("ALERT_FROM_EMAIL");
const alertFunction = functions.find((fn) => fn.slug === "send-alert-email");
const activeAlertFunction = alertFunction?.status === "ACTIVE";

console.log(`Project ref: ${projectRef}`);
console.log(`send-alert-email function: ${activeAlertFunction ? "ACTIVE" : "MISSING/INACTIVE"}`);
console.log(`Required secrets: ${missingRequiredSecrets.length === 0 ? "present" : `missing ${missingRequiredSecrets.join(", ")}`}`);
console.log(`Recommended sender secret (ALERT_FROM_EMAIL): ${hasSenderSecret ? "present" : "missing"}`);

if (!activeAlertFunction) {
  console.error("Hosted Resend setup check failed: send-alert-email function is missing or inactive.");
  process.exit(1);
}

if (missingRequiredSecrets.length > 0) {
  console.error(`Hosted Resend setup check failed: missing required secrets: ${missingRequiredSecrets.join(", ")}.`);
  process.exit(1);
}

if (requireSender && !hasSenderSecret) {
  console.error("Hosted Resend setup check failed: ALERT_FROM_EMAIL is required but missing.");
  process.exit(1);
}

if (!hasSenderSecret) {
  console.warn("Hosted Resend setup warning: ALERT_FROM_EMAIL is missing, so hosted alerts will use the development fallback sender.");
}

console.log("Hosted Resend setup check passed.");

function runSupabaseJson(args) {
  const output = execFileSync("supabase", args, {
    cwd: repoRoot,
    encoding: "utf8",
  });

  return JSON.parse(output);
}

function readTrimmedFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return "";
  }

  return fs.readFileSync(filePath, "utf8").trim();
}
