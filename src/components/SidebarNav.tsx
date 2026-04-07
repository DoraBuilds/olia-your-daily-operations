import { NavLink, useLocation } from "react-router-dom";
import { appNavItems } from "./app-nav";
import { cn } from "@/lib/utils";

export function SidebarNav() {
  const location = useLocation();

  return (
    <aside className="hidden md:flex md:w-[224px] md:shrink-0">
      <div className="sticky top-[88px] w-full rounded-[28px] border border-border bg-card/92 p-3 shadow-[0_18px_50px_rgba(15,23,42,0.06)] backdrop-blur-sm">
        <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
          Navigate
        </p>
        <nav aria-label="Primary" className="space-y-1">
          {appNavItems.map(({ to, label, icon: Icon }) => {
            const active = location.pathname.startsWith(to);

            return (
              <NavLink
                key={to}
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
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
