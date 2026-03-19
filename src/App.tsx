import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Landing from "./pages/Landing";
import Dashboard from "./pages/Dashboard";
import Checklists from "./pages/Checklists";
import Infohub from "./pages/Infohub";
import Admin from "./pages/Admin";
import Kiosk from "./pages/Kiosk";
import Notifications from "./pages/Notifications";
import Billing from "./pages/Billing";
import Signup from "./pages/Signup";
import NotFound from "./pages/NotFound";
import AuthCallback from "./pages/AuthCallback";
import { queryClient } from "@/lib/query-client";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { ErrorBoundary } from "@/components/ErrorBoundary";

const App = () => (
  <ErrorBoundary>
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <ErrorBoundary>
          <Routes>
            {/* Public landing page — unauthenticated */}
            <Route path="/" element={<Landing />} />
            <Route path="/kiosk" element={<Kiosk />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
            <Route path="/checklists/*" element={<ProtectedRoute><Checklists /></ProtectedRoute>} />
            <Route path="/infohub/*" element={<ProtectedRoute><Infohub /></ProtectedRoute>} />
            <Route path="/training/*" element={<Navigate to="/infohub" replace />} />
            <Route path="/maintenance" element={<Navigate to="/dashboard" replace />} />
            <Route path="/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />
            <Route path="/billing" element={<ProtectedRoute><Billing /></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
          </ErrorBoundary>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
  </ErrorBoundary>
);

export default App;

