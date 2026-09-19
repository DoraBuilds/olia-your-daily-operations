import { ReactNode, useEffect, useRef, useSyncExternalStore } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";
import { BottomNav } from "./BottomNav";
import { SidebarNav } from "./SidebarNav";
import {
  hasActiveKioskAdminSession, clearKioskAdminSession, subscribeKioskAdminSession,
} from "@/lib/kiosk-admin-session";
import { clearKioskStaffSession } from "@/lib/kiosk-staff-session";
import { cn } from "@/lib/utils";

interface LayoutProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  headerRight?: ReactNode;
  headerLeft?: ReactNode;
}

export function Layout({ children, title, subtitle, headerRight, headerLeft }: LayoutProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const mainRef = useRef<HTMLElement | null>(null);
  const shellWidthClass = "mx-auto w-full max-w-[1240px]";
  // mx-auto: without it, this max-width column pins to the left edge of
  // <main> and any width freed up — e.g. by collapsing SidebarNav, or by a
  // wide viewport under the shell's 1240px cap — just becomes dead space on
  // the right instead of the column staying centered in the pane.
  const contentWidthClass = "w-full min-w-0 max-w-[920px] xl:max-w-[900px] mx-auto";

  // Every authenticated page renders through here, so this is the one place
  // that has to know about a kiosk-PIN admin session (see
  // kiosk-admin-session.ts / ProtectedRoute.tsx): it swaps the real
  // "Log out" action for "Back to Kiosk" (the real sign-out would kill the
  // lingering owner session the kiosk device's PIN flow depends on) and
  // runs the 90s inactivity timer that returns to /kiosk — wherever in the
  // app that inactivity happens, not just on the admin page.
  //
  // useSyncExternalStore (not a plain call) because the grant can be
  // cleared from elsewhere in the tree — e.g. Admin's "Exit kiosk mode"
  // control (ConceptsTab.tsx) — and this needs to flip off immediately,
  // not wait for Layout to re-render for some unrelated reason (#727).
  const isKioskAdminSession = useSyncExternalStore(subscribeKioskAdminSession, hasActiveKioskAdminSession);

  const handleBackToKiosk = () => {
    clearKioskAdminSession();
    // Also drop the grid's own identify-PIN grant (kiosk-staff-session.ts) —
    // otherwise /kiosk remounts straight onto the already-identified grid
    // instead of the locked PIN screen, making this look like it didn't
    // actually lock the device (#796).
    clearKioskStaffSession();
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
        clearKioskStaffSession();
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
      {/* Header — the "Olia" + owner-name banner that used to live here for
          every page is gone; "Olia" branding lives only in SidebarNav now,
          and Log out/Delete account moved into Admin > Account (AccountTab).
          What's left: (a) the full title/subtitle bar, kept only for pages
          that still pass a distinct `title` (e.g. Maintenance, SOP Library,
          Training), and (b) a title-less "Back to Kiosk" strip so a kiosk
          PIN grant (see kiosk-admin-session.ts) always has an exit, even on
          pages that dropped their title — that control is unrelated to the
          removed Log out button and would otherwise strand a shared kiosk
          device unlocked. */}
      {(title || isKioskAdminSession) && (
        <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border">
          <div className={cn(shellWidthClass, "flex items-center justify-between gap-2 px-4 py-3 sm:px-6 lg:px-8 xl:px-10")}>
            {title ? (
              <>
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
                      <ArrowLeft size={14} /> {t("layout.backToKiosk")}
                    </button>
                  ) : (
                    /* spacer keeps header balanced when no right content exists */
                    !headerRight && <div className="w-8" />
                  )}
                </div>
              </>
            ) : (
              <button
                onClick={handleBackToKiosk}
                className="ml-auto flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5"
              >
                <ArrowLeft size={14} /> {t("layout.backToKiosk")}
              </button>
            )}
          </div>
        </header>
      )}

      {/* Body: sidebar is fixed, only the content column scrolls */}
      <div className="flex flex-1 overflow-hidden">
        <div className={cn(shellWidthClass, "flex flex-1 px-4 sm:px-6 lg:px-8 xl:px-10 gap-6 lg:gap-8")}>
          {/* Sidebar: outside the scroll container so it never scrolls */}
          <SidebarNav />

          {/* Only this column scrolls */}
          <main ref={mainRef} className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden pb-24 pt-5 animate-fade-in md:pb-8 flex flex-col">
            {/* portrait:my-auto centers content vertically only on tall/narrow
                (portrait) viewports, e.g. a short list on a tablet-portrait
                screen — auto margins collapse to 0 once content overflows, so
                long pages still start at the top and scroll normally. Scoped
                to portrait only (not applied unconditionally) so a short page
                viewed in landscape/desktop — e.g. the Admin Billing tab —
                stays anchored under the header instead of drifting to the
                vertical middle of the pane (#regression from #642). */}
            <div className={cn(contentWidthClass, "min-w-0 space-y-4 portrait:my-auto")}>
              {children}
            </div>
          </main>
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
