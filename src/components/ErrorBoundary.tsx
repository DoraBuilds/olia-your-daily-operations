import { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

interface Props {
  children: ReactNode;
  /** Optional fallback UI — defaults to the built-in card. */
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

/**
 * Top-level React error boundary.
 * Catches render-phase errors thrown by any descendant component and
 * displays a friendly recovery screen instead of a blank white page.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorMessage: "" };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error?.message ?? "Unknown error" };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary] Caught error:", error, info.componentStack);

    // Lazy-loaded chunk fails when a new deploy changes the filename hashes
    // while an old version of the app is still open in a browser tab.
    // Detect this and do one hard reload to pick up the new asset manifest.
    // A sessionStorage flag prevents an infinite reload loop.
    const isChunkError =
      error?.message?.includes("Failed to fetch dynamically imported module") ||
      error?.message?.includes("Importing a module script failed") ||
      error?.name === "ChunkLoadError";

    if (isChunkError && !sessionStorage.getItem("chunk_reload_attempted")) {
      sessionStorage.setItem("chunk_reload_attempted", "1");
      window.location.reload();
    }
  }

  handleReset = () => {
    sessionStorage.removeItem("chunk_reload_attempted");
    this.setState({ hasError: false, errorMessage: "" });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

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
              onClick={this.handleReset}
              className="w-full py-3 rounded-xl bg-sage text-white text-sm font-semibold hover:bg-sage-deep transition-colors"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
