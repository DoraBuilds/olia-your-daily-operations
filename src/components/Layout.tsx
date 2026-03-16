import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";
import { BottomNav } from "./BottomNav";
import { useAuth } from "@/contexts/AuthContext";

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

  const handleLogout = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-background flex flex-col max-w-lg mx-auto relative">
      {/* Header */}
      {title && (
        <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border px-4 py-3">
          <div className="flex items-center justify-between gap-2">
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
      <main className="flex-1 overflow-auto pb-24 px-4 py-5 space-y-4 animate-fade-in">
        {children}
      </main>

      <BottomNav />
    </div>
  );
}
