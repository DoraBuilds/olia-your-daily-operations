import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";
import { BottomNav } from "./BottomNav";
import { SidebarNav } from "./SidebarNav";
import { useAuth } from "@/contexts/AuthContext";
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
  const shellWidthClass = "mx-auto w-full max-w-[1380px]";
  const contentWidthClass = "w-full max-w-[1040px] xl:max-w-[980px]";

  const handleLogout = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-background flex flex-col w-full relative">
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
              {user ? (
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

      {/* Content */}
      <main className="flex-1 overflow-auto pb-24 pt-5 animate-fade-in md:pb-8">
        <div className={cn(shellWidthClass, "px-4 sm:px-6 lg:px-8 xl:px-10")}>
          <div className="flex items-start gap-6 lg:gap-8">
            <SidebarNav />
            <div className={cn(contentWidthClass, "space-y-4")}>
              {children}
            </div>
          </div>
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
