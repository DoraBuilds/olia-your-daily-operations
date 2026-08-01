import { AlertTriangle } from "lucide-react";

/** Shared recovery-screen UI for both the render-phase and route-level error boundaries. */
export function ErrorFallbackCard({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="bg-card border border-border rounded-2xl p-8 max-w-sm w-full text-center space-y-4 shadow-sm">
        <div className="w-14 h-14 rounded-full bg-status-error/10 flex items-center justify-center mx-auto">
          <AlertTriangle size={24} className="text-status-error" />
        </div>
        <div>
          <h2 className="font-display text-xl text-foreground">Something went wrong</h2>
          <p className="text-sm text-muted-foreground mt-2">
            An unexpected error occurred. Try refreshing the page.
          </p>
        </div>
        <button
          onClick={onRetry}
          className="w-full py-3 rounded-xl bg-sage text-white text-sm font-semibold hover:bg-sage-deep transition-colors"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
