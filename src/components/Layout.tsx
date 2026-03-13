import { ReactNode } from "react";
import { BottomNav } from "./BottomNav";

interface LayoutProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  headerRight?: ReactNode;
  headerLeft?: ReactNode;
}

export function Layout({ children, title, subtitle, headerRight, headerLeft }: LayoutProps) {
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
            {headerRight ? (
              <div className="flex items-center gap-2 shrink-0">{headerRight}</div>
            ) : <div className="w-8" />}
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
