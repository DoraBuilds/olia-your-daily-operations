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
}));
