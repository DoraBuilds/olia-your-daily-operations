import { ReactNode, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, LogOut } from "lucide-react";
import { BottomNav } from "./BottomNav";
import { SidebarNav } from "./SidebarNav";
import { useAuth } from "@/contexts/AuthContext";
import { hasActiveKioskAdminSession, clearKioskAdminSession } from "@/lib/kiosk-admin-session";
import { cn } from "@/lib/utils";

interface LayoutProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  headerRight?: ReactNode;
  headerLeft?: ReactNode;
}

export function Layout({ children, title, subtitle, headerRight, headerLeft }: LayoutProps) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const mainRef = useRef<HTMLElement | null>(null);
  const shellWidthClass = "mx-auto w-full max-w-[1240px]";
  const contentWidthClass = "w-full min-w-0 max-w-[920px] xl:max-w-[900px]";

  // Every authenticated page renders through here, so this is the one place
  // that has to know about a kiosk-PIN admin session (see
  // kiosk-admin-session.ts / ProtectedRoute.tsx): it swaps the real
  // "Log out" action for "Back to Kiosk" (the real sign-out would kill the
  // lingering owner session the kiosk device's PIN flow depends on) and
  // runs the 90s inactivity timer that returns to /kiosk — wherever in the
  // app that inactivity happens, not just on the admin page.
  const isKioskAdminSession = hasActiveKioskAdminSession();

  const handleLogout = async () => {
    await signOut();
    navigate("/");
  };

  const handleBackToKiosk = () => {
    clearKioskAdminSession();
    navigate("/kiosk");
  };

  useEffect(() => {
    mainRef.current?.scrollTo?.({ top: 0, behavior: "auto" });
    if (mainRef.current) {
      mainRef.current.scrollTop = 0;
    }
  }, [location.pathname]);

  useEffect(() => {
    if (!isKioskAdminSession) return;
    let inactivityTimer: ReturnType<typeof setTimeout> | undefined;
    const reset = () => {
      if (inactivityTimer) clearTimeout(inactivityTimer);
      inactivityTimer = setTimeout(() => {
        clearKioskAdminSession();
        navigate("/kiosk");
      }, 90000);
    };
    const events = ["mousemove", "keydown", "touchstart", "click"] as const;
    events.forEach(e => window.addEventListener(e, reset));
    reset();
    return () => {
      events.forEach(e => window.removeEventListener(e, reset));
      if (inactivityTimer) clearTimeout(inactivityTimer);
    };
  }, [isKioskAdminSession, navigate]);

  return (
    <div className="h-screen bg-background flex flex-col w-full overflow-hidden relative">
      {/* Header */}
      {title && (
        <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border">
          <div className={cn(shellWidthClass, "flex items-center justify-between gap-2 px-4 py-3 sm:px-6 lg:px-8 xl:px-10")}>
            {headerLeft ? (
              <div className="flex items-center gap-2 shrink-0">{headerLeft}</div>
            ) : <div className="w-8" />}
            <div className="flex-1 min-w-0 text-center">
              <h1 className="font-display text-lg text-foreground leading-tight truncate">{title}</h1>
              {subtitle && (
                <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{subtitle}</p>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {headerRight && (
                <div className="flex items-center gap-2">{headerRight}</div>
              )}
              {isKioskAdminSession ? (
                <button
                  onClick={handleBackToKiosk}
                  className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5"
                >
                  <ArrowLeft size={14} /> Kiosk
                </button>
              ) : user ? (
                <button
                  onClick={handleLogout}
                  aria-label="Log out"
                  className="p-2 rounded-full hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                >
                  <LogOut size={16} />
                </button>
              ) : (
                /* spacer keeps header balanced when no right content exists */
                !headerRight && <div className="w-8" />
              )}
            </div>
          </div>
        </header>
      )}

      {/* Body: sidebar is fixed, only the content column scrolls */}
      <div className="flex flex-1 overflow-hidden">
        <div className={cn(shellWidthClass, "flex flex-1 px-4 sm:px-6 lg:px-8 xl:px-10 gap-6 lg:gap-8")}>
          {/* Sidebar: outside the scroll container so it never scrolls */}
          <SidebarNav />

          {/* Only this column scrolls */}
          <main ref={mainRef} className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden pb-24 pt-5 animate-fade-in md:pb-8">
            <div className={cn(contentWidthClass, "min-w-0 space-y-4")}>
              {children}
            </div>
          </main>
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
