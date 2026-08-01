import { Suspense, lazy, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, RouterProvider, Navigate, Outlet, useLocation } from "react-router-dom";
import { queryClient } from "@/lib/query-client";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { RouteErrorBoundary } from "@/components/RouteErrorBoundary";
import { routerFutureFlags } from "@/lib/router-future-flags";
import { CookieBanner } from "@/components/CookieBanner";
import { isNewDesignPath } from "@/lib/legal-theme";

const SundayRemixSite = lazy(() => import("./pages/experiments/SundayRemixSite"));
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
const AcceptInvite = lazy(() => import("./pages/AcceptInvite"));
const Privacy = lazy(() => import("./pages/Privacy"));
const Terms = lazy(() => import("./pages/Terms"));
const Cookies = lazy(() => import("./pages/Cookies"));
const AvisoLegal = lazy(() => import("./pages/AvisoLegal"));

function RootLayout() {
  const location = useLocation();

  // iOS Safari paints the plain <body> background in the elastic-overscroll
  // area above fixed content (and behind the notch/status bar with
  // viewport-fit=cover) — keep it in sync with whichever design is showing
  // instead of leaving it on the old app's default ivory.
  useEffect(() => {
    document.body.style.backgroundColor = isNewDesignPath(location.pathname) ? "#ffffff" : "";
  }, [location.pathname]);

  return (
    <>
      <Outlet />
      <CookieBanner />
    </>
  );
}

function RouteLoadingFallback() {
  // Rendered outside RouterProvider (the Suspense boundary wraps it), so
  // useLocation() isn't available yet — read the path straight off window.
  if (isNewDesignPath(window.location.pathname)) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-6">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 rounded-full mx-auto animate-pulse" style={{ background: "#00E5CC" }} />
          <p className="text-sm" style={{ fontFamily: "'Hanken Grotesk', system-ui, sans-serif", color: "#4B564F" }}>Loading Olia…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="text-center space-y-2">
        <div className="w-10 h-10 rounded-2xl bg-sage mx-auto animate-pulse" />
        <p className="text-sm text-muted-foreground">Loading Olia…</p>
      </div>
    </div>
  );
}

const router = createBrowserRouter(
  [
    {
      element: <RootLayout />,
      errorElement: <RouteErrorBoundary />,
      children: [
        { path: "/", element: <SundayRemixSite /> },
        { path: "/experiments/sunday-remix-site", element: <SundayRemixSite /> },
        { path: "/privacy", element: <Privacy /> },
        { path: "/terms", element: <Terms /> },
        { path: "/cookies", element: <Cookies /> },
        { path: "/aviso-legal", element: <AvisoLegal /> },
        { path: "/kiosk", element: <Kiosk /> },
        { path: "/signup", element: <Signup /> },
        { path: "/login", element: <Login /> },
        { path: "/auth/callback", element: <AuthCallback /> },
        { path: "/accept-invite", element: <AcceptInvite /> },
        { path: "/dashboard", element: <ProtectedRoute><Dashboard /></ProtectedRoute> },
        { path: "/notifications", element: <ProtectedRoute><Notifications /></ProtectedRoute> },
        { path: "/checklists/*", element: <ProtectedRoute><Checklists /></ProtectedRoute> },
        { path: "/reporting", element: <ProtectedRoute><Reporting /></ProtectedRoute> },
        { path: "/infohub", element: <Navigate to="/infohub/library" replace /> },
        { path: "/infohub/library/*", element: <ProtectedRoute><Infohub /></ProtectedRoute> },
        { path: "/infohub/training/*", element: <ProtectedRoute><Infohub /></ProtectedRoute> },
        { path: "/training/*", element: <Navigate to="/infohub/training" replace /> },
        { path: "/maintenance", element: <Navigate to="/dashboard" replace /> },
        { path: "/admin", element: <Navigate to="/admin/location" replace /> },
        { path: "/admin/location", element: <ProtectedRoute><Admin /></ProtectedRoute> },
        { path: "/admin/users", element: <ProtectedRoute><Admin /></ProtectedRoute> },
        { path: "/admin/account", element: <ProtectedRoute><Admin /></ProtectedRoute> },
        { path: "/admin/notifications", element: <ProtectedRoute><Admin /></ProtectedRoute> },
        { path: "/admin/billing", element: <ProtectedRoute><Admin /></ProtectedRoute> },
        { path: "/billing", element: <ProtectedRoute><Billing /></ProtectedRoute> },
        { path: "*", element: <NotFound /> },
      ],
    },
  ],
  {
    basename: import.meta.env.BASE_URL,
    future: routerFutureFlags,
  }
);

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <ErrorBoundary>
            <Suspense fallback={<RouteLoadingFallback />}>
              <RouterProvider router={router} />
            </Suspense>
          </ErrorBoundary>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
