/**
 * True when `error` is a lazy-loaded module chunk failing to fetch — the
 * classic case of a browser tab left open across a deploy, still holding
 * old asset-hash URLs that the new build no longer serves.
 */
export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("Failed to fetch dynamically imported module") ||
    message.includes("Importing a module script failed") ||
    (error instanceof Error && error.name === "ChunkLoadError")
  );
}
