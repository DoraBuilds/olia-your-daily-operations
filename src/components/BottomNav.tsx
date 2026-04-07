import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { appNavItems } from "./app-nav";

export function BottomNav() {
  const location = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card shadow-sm safe-area-pb md:hidden">
      <div className="mx-auto flex items-stretch w-full max-w-[1200px] px-2 sm:px-4">
        {appNavItems.map(({ to, label, icon: Icon }) => {
          const active = location.pathname.startsWith(to);
          return (
            <NavLink
              key={to}
              to={to}
              id={`nav-${label.toLowerCase()}`}
              className="relative flex flex-1 flex-col items-center justify-center gap-1 py-2 px-2 text-[10px] font-medium transition-colors min-h-[58px] select-none"
            >
              <span
                className={cn(
                  "flex items-center justify-center w-10 h-6 rounded-full transition-colors",
                  active ? "bg-sage" : ""
                )}
              >
                <Icon
                  size={18}
                  strokeWidth={active ? 2 : 1.5}
                  className={cn(
                    "transition-colors",
                    active ? "text-white" : "text-muted-foreground"
                  )}
                />
              </span>
              <span
                className={cn(
                  "transition-colors tracking-wide",
                  active ? "text-sage font-semibold" : "text-muted-foreground"
                )}
              >
                {label}
              </span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
