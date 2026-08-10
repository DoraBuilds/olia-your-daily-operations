import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import enCommon from "@/locales/en/common.json";
import esCommon from "@/locales/es/common.json";
import enKiosk from "@/locales/en/kiosk.json";
import esKiosk from "@/locales/es/kiosk.json";
import enDashboard from "@/locales/en/dashboard.json";
import esDashboard from "@/locales/es/dashboard.json";
import enNotifications from "@/locales/en/notifications.json";
import esNotifications from "@/locales/es/notifications.json";

export const SUPPORTED_LANGUAGES = ["en", "es"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export const DEFAULT_LANGUAGE: SupportedLanguage = "en";

const resources = {
  en: { common: enCommon, kiosk: enKiosk, dashboard: enDashboard, notifications: enNotifications },
  es: { common: esCommon, kiosk: esKiosk, dashboard: esDashboard, notifications: esNotifications },
};

// Namespaces are added here as each app area is translated (checklists,
// settings, admin, billing, ...) — see issue #594.
const NAMESPACES = ["common", "kiosk", "dashboard", "notifications"];

// Picks a supported language from a raw BCP-47 tag (e.g. "es-MX" -> "es"),
// falling back to DEFAULT_LANGUAGE for anything unsupported/unset. Kept as a
// standalone function (rather than an i18next-browser-languagedetector
// plugin) because staff and kiosk each resolve their initial language from a
// different source (Supabase profile vs. device localStorage) and need this
// same fallback logic applied consistently to both.
export function resolveSupportedLanguage(tag: string | null | undefined): SupportedLanguage {
  if (!tag) return DEFAULT_LANGUAGE;
  const base = tag.toLowerCase().split("-")[0];
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(base)
    ? (base as SupportedLanguage)
    : DEFAULT_LANGUAGE;
}

i18n.use(initReactI18next).init({
  resources,
  ns: NAMESPACES,
  defaultNS: "common",
  lng: resolveSupportedLanguage(typeof navigator !== "undefined" ? navigator.language : undefined),
  fallbackLng: DEFAULT_LANGUAGE,
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
});

export default i18n;
