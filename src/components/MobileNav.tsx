import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ChevronDown, LogOut, Menu, X } from "lucide-react";
import { appNavItems } from "./app-nav";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

/** Admin sections, in the same order as the desktop tab row in Admin.tsx.
 *  Only the Concepts section is visible to non-owners (Admin.tsx redirects
 *  them away from the rest). */
export const ADMIN_SECTIONS = [
  { to: "/admin/location", labelKey: "tabs.locations", ownerOnly: false },
  { to: "/admin/departments", labelKey: "tabs.departments", ownerOnly: true },
  { to: "/admin/users", labelKey: "tabs.users", ownerOnly: true },
  { to: "/admin/kiosks", labelKey: "tabs.kiosks", ownerOnly: true },
  { to: "/admin/account", labelKey: "tabs.account", ownerOnly: true },
  { to: "/admin/billing", labelKey: "tabs.billing", ownerOnly: true },
] as const;

interface MobileMenuProps {
  isKioskAdminSession: boolean;
  onBackToKiosk: () => void;
}

function useAdminSections() {
  const { teamMember } = useAuth();
  const isOwner = teamMember?.is_owner ?? false;
  return ADMIN_SECTIONS.filter((s) => isOwner || !s.ownerOnly);
}

/** Phone-width page name for title-less pages (most of the app): the main
 *  nav item's label, or "Admin" over the current admin section. */
export function MobileRouteTitle() {
  const { t } = useTranslation();
  const { t: tAdmin } = useTranslation("admin");
  const location = useLocation();
  const adminSections = useAdminSections();
  const currentItem = appNavItems.find((i) => location.pathname.startsWith(i.to));

  if (location.pathname.startsWith("/admin")) {
    const section = adminSections.find((s) => location.pathname.startsWith(s.to)) ?? adminSections[0];
    return (
      <div className="flex-1 min-w-0">
        <span className="block text-xs text-muted-foreground leading-none">{t("nav.admin")}</span>
        <span className="block font-display text-lg text-foreground leading-tight truncate">{tAdmin(section.labelKey)}</span>
      </div>
    );
  }
  return (
    <span className="flex-1 min-w-0 block font-display text-lg text-foreground leading-tight truncate">
      {currentItem ? t(currentItem.labelKey) : "Olia"}
    </span>
  );
}

/**
 * Phone-width navigation (below `md`): a burger button (Layout puts it at the
 * start of its header) opening a left drawer that holds the whole app nav —
 * the four main pages plus Admin, whose sections expand underneath it. It
 * replaced the bottom tab bar, which had no room for Admin's six sections
 * (they used to be a tab row that overflowed on phones). From `md` up the
 * fixed SidebarNav takes over and this renders nothing visible.
 */
export function MobileMenu({ isKioskAdminSession, onBackToKiosk }: MobileMenuProps) {
  const { t } = useTranslation();
  const { t: tAdmin } = useTranslation("admin");
  const location = useLocation();
  const navigate = useNavigate();
  const { teamMember, signOut } = useAuth();
  const adminSections = useAdminSections();

  const inAdmin = location.pathname.startsWith("/admin");
  const [open, setOpen] = useState(false);
  const [adminExpanded, setAdminExpanded] = useState(inAdmin);

  // Any navigation (including picking an item from the drawer) closes it.
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const currentSection = inAdmin
    ? adminSections.find((s) => location.pathname.startsWith(s.to)) ?? adminSections[0]
    : undefined;

  const handleLogOut = async () => {
    await signOut();
    navigate("/");
  };

  const openDrawer = () => {
    // Re-open Admin's sections whenever the drawer opens from an admin page,
    // so the current section is always visible without an extra tap.
    if (inAdmin) setAdminExpanded(true);
    setOpen(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={openDrawer}
        aria-label={t("layout.openMenu")}
        aria-expanded={open}
        className="md:hidden -ml-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-foreground hover:bg-muted transition-colors"
      >
        <Menu size={22} strokeWidth={1.8} />
      </button>

      {open && createPortal(
        <div className="fixed inset-0 z-[60] md:hidden">
          <div
            data-testid="mobile-nav-backdrop"
            className="absolute inset-0 bg-foreground/25 backdrop-blur-[2px] animate-fade-in"
            onClick={() => setOpen(false)}
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label={t("layout.menu")}
            className="absolute left-0 top-0 bottom-0 flex w-[80%] max-w-[320px] flex-col rounded-r-[28px] bg-card shadow-2xl safe-area-pt safe-area-pb"
          >
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border/60">
              <div className="flex items-center gap-2.5">
                <img src="/brand/logo/olia-mark-dark.svg" alt="" className="w-7 h-7" />
                <span className="font-display text-[19px] font-semibold text-foreground tracking-tight leading-none">Olia</span>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t("layout.closeMenu")}
                className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <nav aria-label="Primary" className="flex-1 overflow-y-auto p-3 space-y-1">
              {appNavItems.map(({ id, to, labelKey, icon: Icon }) => {
                const active = location.pathname.startsWith(to);
                const rowClass = cn(
                  "w-full flex items-center gap-3 rounded-2xl px-3 py-3 text-[15px] font-medium transition-colors",
                  active ? "text-foreground" : "text-muted-foreground hover:bg-muted/60",
                );

                if (id === "admin" && adminSections.length > 1) {
                  return (
                    <div key={to}>
                      <button
                        type="button"
                        onClick={() => setAdminExpanded((v) => !v)}
                        aria-expanded={adminExpanded}
                        className={rowClass}
                      >
                        <Icon size={19} strokeWidth={active ? 2.2 : 1.8} />
                        <span className="flex-1 text-left">{t(labelKey)}</span>
                        <ChevronDown size={17} className={cn("transition-transform", adminExpanded && "rotate-180")} />
                      </button>
                      {adminExpanded && (
                        <div className="ml-[21px] mt-0.5 space-y-0.5 border-l border-border/70 pl-3">
                          {adminSections.map((s) => {
                            const sectionActive = currentSection?.to === s.to;
                            return (
                              <NavLink
                                key={s.to}
                                to={s.to}
                                onClick={() => setOpen(false)}
                                className={cn(
                                  "block rounded-xl px-3 py-2.5 text-sm transition-colors",
                                  sectionActive ? "bg-muted text-foreground font-semibold" : "text-muted-foreground hover:bg-muted/60",
                                )}
                              >
                                {tAdmin(s.labelKey)}
                              </NavLink>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                }

                return (
                  <NavLink
                    key={to}
                    to={to}
                    id={`mobile-nav-${id}`}
                    onClick={() => setOpen(false)}
                    className={cn(rowClass, active && "bg-muted")}
                  >
                    <Icon size={19} strokeWidth={active ? 2.2 : 1.8} />
                    {t(labelKey)}
                  </NavLink>
                );
              })}
            </nav>

            {(teamMember || isKioskAdminSession) && (
              <div className="flex items-center gap-3 border-t border-border/60 p-4">
                {teamMember && (
                  <div className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-foreground truncate">{teamMember.name}</span>
                    <span className="block text-xs text-muted-foreground truncate">{teamMember.email}</span>
                  </div>
                )}
                {/* A kiosk-PIN admin session must never offer the real Log out —
                    it would kill the owner session the kiosk device depends on
                    (see Layout.tsx / kiosk-admin-session.ts). */}
                {isKioskAdminSession ? (
                  <button
                    type="button"
                    onClick={onBackToKiosk}
                    className="ml-auto flex shrink-0 items-center gap-1 rounded-xl px-3 py-2 text-sm font-semibold text-foreground bg-muted"
                  >
                    <ArrowLeft size={15} /> {t("layout.backToKiosk")}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleLogOut}
                    aria-label={t("layout.logOut")}
                    title={t("layout.logOut")}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted transition-colors"
                  >
                    <LogOut size={17} />
                  </button>
                )}
              </div>
            )}
          </aside>
        </div>,
        document.body,
      )}
    </>
  );
}
