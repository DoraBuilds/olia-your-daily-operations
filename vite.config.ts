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
    chunkSizeWarningLimit: 500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("jspdf") || id.includes("jspdf-autotable")) {
            return "pdf-export";
          }

          if (id.includes("xlsx")) {
            return "spreadsheet-tools";
          }

          if (id.includes("html2canvas") || id.includes("pdfjs-dist")) {
            return "document-preview";
          }

          if (id.includes("recharts")) {
            return "charts";
          }

          if (id.includes("@supabase")) {
            return "supabase";
          }

          return undefined;
        },
      },
    },
  },
}));
