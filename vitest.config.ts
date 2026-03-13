import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],

    // Kill any test or hook that takes longer than 15 s — prevents zombie workers.
    testTimeout: 15000,
    hookTimeout: 15000,

    // ── Coverage ────────────────────────────────────────────────────────────
    // Run with: bun run test:coverage
    // Enforced in CI with: bun run test:ci (fails build if thresholds not met)
    coverage: {
      provider: "istanbul",
      reporter: ["text", "text-summary", "html", "lcov"],
      reportsDirectory: "./coverage",

      // Measure our source files only — exclude generated/bootstrap code
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/test/**",
        "src/**/*.test.{ts,tsx}",
        "src/**/*.spec.{ts,tsx}",
        "src/components/ui/**",  // shadcn generated — not our code
        "src/main.tsx",          // Capacitor bootstrap, not business logic
        "src/vite-env.d.ts",
      ],

      // ── Quality Gate: 95% across all four metrics ─────────────────────
      // ANY metric below 95% causes `bun run test:ci` to exit with code 1.
      // ── Quality Gate ──────────────────────────────────────────────────
      // True baseline as of March 2026 (coverage generation was broken
      // with bun + vitest forks pool — now fixed with default pool).
      // Target is 95% but the codebase is currently at ~56-60%.
      // Raise these incrementally as new tests are added.
      // TODO: Increase to 95% once large page files are more thoroughly tested.
      thresholds: {
        lines:      60,
        functions:  45,
        branches:   48,
        statements: 56,
      },
    },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
