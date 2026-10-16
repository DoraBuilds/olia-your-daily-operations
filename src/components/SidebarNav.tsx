import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { appNavItems } from "./app-nav";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

const COLLAPSED_STORAGE_KEY = "olia_sidebar_collapsed";

function readStoredCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/** Collapsed state lives in Layout (the toggle sits in the top bar), persisted here. */
export function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState(readStoredCollapsed);

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSED_STORAGE_KEY, collapsed ? "1" : "0");
    } catch {
      // localStorage unavailable (private browsing, etc.) — collapse state
      // just won't persist across reloads, which is fine.
    }
  }, [collapsed]);

  return [collapsed, setCollapsed] as const;
}

export function SidebarNav({ collapsed = false }: { collapsed?: boolean }) {
  const location = useLocation();
  const { t } = useTranslation();
  const { teamMember } = useAuth();
  const isOwner = teamMember?.is_owner ?? false;

  return (
    <aside
      className={cn(
        "hidden md:flex md:shrink-0 pt-2 pb-8 pl-3 pr-3 transition-[width] duration-base ease-inout overflow-y-auto",
        collapsed ? "md:w-[72px]" : "md:w-[248px]",
      )}
    >
      <div className="w-full h-fit">
        <nav aria-label={t("a11y.primaryNav")} className={cn("space-y-1", collapsed && "flex flex-col items-center")}>
          {appNavItems.map(({ to, labelKey, icon: Icon, children }) => {
            const active = location.pathname.startsWith(to);
            const label = t(labelKey);
            const visibleChildren = children?.filter((child) => {
              if (child.ownerOnly && !isOwner) return false;
              return true;
            }) ?? [];

            return (
              <div key={to} className={cn("space-y-1", collapsed && "w-full flex justify-center")}>
                <NavLink
                  to={to}
                  title={collapsed ? label : undefined}
                  className={cn(
                    "group relative flex items-center transition-colors",
                    collapsed
                      ? "h-11 w-11 justify-center rounded-full"
                      : "gap-3 rounded-full px-4 py-2.5 text-sm font-medium",
                    active
                      ? "bg-card text-[hsl(var(--powder-blue-deep))] shadow-sm"
                      : "text-muted-foreground hover:bg-card/60 hover:text-foreground",
                  )}
                >
                  <Icon size={18} strokeWidth={active ? 2.2 : 1.8} />
                  {!collapsed && (
                    <span className="tracking-[0.02em]">{label}</span>
                  )}
                </NavLink>
                {!collapsed && visibleChildren.length > 0 ? (
                  <div className="ml-5 border-l border-border/70 pl-4 space-y-1">
                    {visibleChildren.map((child) => {
                      const childActive = location.pathname.startsWith(child.to);
                      return (
                        <NavLink
                          key={child.to}
                          to={child.to}
                          className={cn(
                            "block rounded-xl px-3 py-2 text-xs font-semibold transition-colors",
                            childActive
                              ? "bg-card text-foreground"
                              : "text-muted-foreground hover:bg-card/60 hover:text-foreground",
                          )}
                        >
                          {t(child.labelKey)}
                        </NavLink>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
