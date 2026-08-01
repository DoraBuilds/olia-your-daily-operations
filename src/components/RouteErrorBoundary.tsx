import { useRouteError } from "react-router-dom";
import { ErrorFallbackCard } from "@/components/ErrorFallbackCard";
import { isChunkLoadError } from "@/lib/chunk-error";

/**
 * `createBrowserRouter` catches render errors per-route internally and
 * never lets them bubble up to a React error boundary wrapping
 * `RouterProvider` — it needs its own `errorElement`. Without this, a
 * stale-chunk failure (route lazy-import 404s after a new deploy) shows
 * React Router's generic "Unexpected Application Error!" screen instead of
 * the auto-reload recovery `ErrorBoundary` provides everywhere else.
 */
export function RouteErrorBoundary() {
  const error = useRouteError();
  console.error("[RouteErrorBoundary] Caught error:", error);

  if (isChunkLoadError(error) && !sessionStorage.getItem("chunk_reload_attempted")) {
    sessionStorage.setItem("chunk_reload_attempted", "1");
    window.location.reload();
    return null;
  }

  return (
    <ErrorFallbackCard
      onRetry={() => {
        sessionStorage.removeItem("chunk_reload_attempted");
        window.location.reload();
      }}
    />
  );
}
