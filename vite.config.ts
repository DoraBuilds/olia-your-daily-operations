import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

const repoName = process.env.GITHUB_REPOSITORY?.split("/")[1];
const productionBasePath = process.env.VITE_BASE_PATH ?? (repoName ? `/${repoName}/` : "/");

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  base: mode === "production" ? productionBasePath : "/",
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Heavy async-only export tools — never on the critical path
          if (id.includes("jspdf") || id.includes("jspdf-autotable")) {
            return "pdf-export";
          }

          if (id.includes("xlsx")) {
            return "spreadsheet-tools";
          }

          if (id.includes("html2canvas") || id.includes("pdfjs-dist")) {
            return "document-preview";
          }

          // Charting library — only used on Reporting route
          if (id.includes("recharts")) {
            return "charts";
          }

          // Supabase client — shared but heavy, isolate it
          if (id.includes("@supabase")) {
            return "supabase";
          }

          // React core — keep together so React is a single shared singleton
          if (id.includes("/node_modules/react/") ||
              id.includes("/node_modules/react-dom/") ||
              id.includes("/node_modules/react-is/") ||
              id.includes("/node_modules/scheduler/")) {
            return "react-vendor";
          }

          // Tanstack React Query
          if (id.includes("@tanstack/")) {
            return "react-query";
          }

          // Radix UI primitives — used across many pages, isolate for shared caching
          if (id.includes("@radix-ui/")) {
            return "radix-ui";
          }

          // Date utilities — react-day-picker + date-fns travel together
          if (id.includes("react-day-picker") || id.includes("/node_modules/date-fns/")) {
            return "date-utils";
          }

          // Icon set — large but all pages use some icons; keep in one cached chunk
          if (id.includes("lucide-react")) {
            return "icons";
          }

          return undefined;
        },
      },
    },
  },
}));
