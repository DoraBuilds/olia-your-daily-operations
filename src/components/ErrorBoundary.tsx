import { Component, ErrorInfo, ReactNode } from "react";
import { ErrorFallbackCard } from "@/components/ErrorFallbackCard";
import { isChunkLoadError } from "@/lib/chunk-error";

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
    if (isChunkLoadError(error) && !sessionStorage.getItem("chunk_reload_attempted")) {
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

      return <ErrorFallbackCard onRetry={this.handleReset} />;
    }

    return this.props.children;
  }
}
