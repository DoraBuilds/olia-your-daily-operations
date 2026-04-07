import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { queryClient } from "@/lib/query-client";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { routerFutureFlags } from "@/lib/router-future-flags";

const Landing = lazy(() => import("./pages/Landing"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Checklists = lazy(() => import("./pages/Checklists"));
const Reporting = lazy(() => import("./pages/Reporting"));
const Infohub = lazy(() => import("./pages/Infohub"));
const Admin = lazy(() => import("./pages/Admin"));
const Kiosk = lazy(() => import("./pages/Kiosk"));
const Notifications = lazy(() => import("./pages/Notifications"));
const Billing = lazy(() => import("./pages/Billing"));
const Signup = lazy(() => import("./pages/Signup"));
const Login = lazy(() => import("./pages/Login"));
const NotFound = lazy(() => import("./pages/NotFound"));
const AuthCallback = lazy(() => import("./pages/AuthCallback"));

function RouteLoadingFallback() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="text-center space-y-2">
        <div className="w-10 h-10 rounded-2xl bg-sage mx-auto animate-pulse" />
        <p className="text-sm text-muted-foreground">Loading Olia…</p>
      </div>
    </div>
  );
}

const App = () => (
  <ErrorBoundary>
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter basename={import.meta.env.BASE_URL} future={routerFutureFlags}>
          <ErrorBoundary>
            <Suspense fallback={<RouteLoadingFallback />}>
              <Routes>
                {/* Public landing page — unauthenticated */}
                <Route path="/" element={<Landing />} />
                <Route path="/kiosk" element={<Kiosk />} />
                <Route path="/signup" element={<Signup />} />
                <Route path="/login" element={<Login />} />
                <Route path="/auth/callback" element={<AuthCallback />} />
                <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
                <Route path="/checklists/*" element={<ProtectedRoute><Checklists /></ProtectedRoute>} />
                <Route path="/reporting" element={<ProtectedRoute><Reporting /></ProtectedRoute>} />
                <Route path="/infohub/*" element={<ProtectedRoute><Infohub /></ProtectedRoute>} />
                <Route path="/training/*" element={<Navigate to="/infohub" replace />} />
                <Route path="/maintenance" element={<Navigate to="/dashboard" replace />} />
                <Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />
                <Route path="/billing" element={<ProtectedRoute><Billing /></ProtectedRoute>} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
