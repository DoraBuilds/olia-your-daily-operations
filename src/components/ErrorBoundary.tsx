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
    // Log to console in development; swap for a real error tracker in prod
    console.error("[ErrorBoundary] Caught error:", error, info.componentStack);
  }

  handleReset = () => {
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
