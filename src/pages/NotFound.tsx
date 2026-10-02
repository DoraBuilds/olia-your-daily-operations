import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { legalTheme, legalLinkStyle } from "@/lib/legal-theme";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";

const NotFound = () => {
  const { t } = useTranslation("common");
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  useDocumentMeta("Page not found — Olia", undefined, { noindex: true });

  return (
    <div
      className="flex min-h-screen items-center justify-center bg-background legal-scope"
      style={legalTheme}
    >
      <style>{legalLinkStyle}</style>
      <div className="text-center px-6">
        <h1 className="mb-4 font-display text-6xl text-foreground">404</h1>
        <p className="mb-6 text-lg text-muted-foreground">{t("notFound.title")}</p>
        <Link to="/" className="text-sm underline underline-offset-2 transition-colors">
          {t("notFound.home")}
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
