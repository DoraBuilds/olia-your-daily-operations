import { NavLink, useLocation } from "react-router-dom";
import { appNavItems } from "./app-nav";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

export function SidebarNav() {
  const location = useLocation();
  const { teamMember } = useAuth();
  const isOwner = teamMember?.role === "Owner";

  return (
    <aside className="hidden md:flex md:w-[224px] md:shrink-0">
      <div className="sticky top-[88px] w-full rounded-[28px] border border-border bg-card/92 p-3 shadow-[0_18px_50px_rgba(15,23,42,0.06)] backdrop-blur-sm">
        <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
          Navigate
        </p>
        <nav aria-label="Primary" className="space-y-1">
          {appNavItems.map(({ to, label, icon: Icon, children }) => {
            const active = location.pathname.startsWith(to);
            const visibleChildren = children?.filter((child) => {
              if (to === "/admin" && child.to === "/admin/account" && !isOwner) {
                return false;
              }
              return true;
            }) ?? [];

            return (
              <div key={to} className="space-y-1">
                <NavLink
                  to={to}
                  className={cn(
                    "group flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-medium transition-all",
                    active
                      ? "bg-sage text-white shadow-sm"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-2xl transition-colors",
                      active ? "bg-white/16" : "bg-muted text-muted-foreground group-hover:bg-card",
                    )}
                  >
                    <Icon size={18} strokeWidth={active ? 2.2 : 1.8} />
                  </span>
                  <span className="tracking-[0.02em]">{label}</span>
                </NavLink>
                {active && visibleChildren.length > 0 ? (
                  <div className="ml-5 border-l border-border/70 pl-4 space-y-1">
                    {visibleChildren.map((child) => {
                      const childActive = location.pathname.startsWith(child.to);
                      return (
                        <NavLink
                          key={child.to}
                          to={child.to}
                          className={cn(
                            "block rounded-xl px-3 py-2 text-xs font-semibold tracking-[0.08em] uppercase transition-colors",
                            childActive
                              ? "bg-muted text-foreground"
                              : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                          )}
                        >
                          {child.label}
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
