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
import enChecklists from "@/locales/en/checklists.json";
import esChecklists from "@/locales/es/checklists.json";
import enInfohub from "@/locales/en/infohub.json";
import esInfohub from "@/locales/es/infohub.json";
import enAdmin from "@/locales/en/admin.json";
import esAdmin from "@/locales/es/admin.json";
import enBilling from "@/locales/en/billing.json";
import esBilling from "@/locales/es/billing.json";
import enAuth from "@/locales/en/auth.json";
import esAuth from "@/locales/es/auth.json";

export const SUPPORTED_LANGUAGES = ["en", "es"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export const DEFAULT_LANGUAGE: SupportedLanguage = "en";

const resources = {
  en: { common: enCommon, kiosk: enKiosk, dashboard: enDashboard, notifications: enNotifications, checklists: enChecklists, infohub: enInfohub, admin: enAdmin, billing: enBilling, auth: enAuth },
  es: { common: esCommon, kiosk: esKiosk, dashboard: esDashboard, notifications: esNotifications, checklists: esChecklists, infohub: esInfohub, admin: esAdmin, billing: esBilling, auth: esAuth },
};

// This is the full namespace set — Phase 4 string-extraction sweep
// (issue #594) is complete as of this namespace being added.
const NAMESPACES = ["common", "kiosk", "dashboard", "notifications", "checklists", "infohub", "admin", "billing", "auth"];

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

// The device's last known language: picked on the Log in / Sign up page, or
// the signed-in user's saved preference. Lets signed-out pages (and the first
// paint after a reload) open in that language instead of the browser's.
const DEVICE_LANGUAGE_KEY = "olia_language";
// Set only when someone explicitly picks a language on Log in / Sign up;
// consumed once they're signed in, when it's saved to their profile.
const PENDING_LANGUAGE_KEY = "olia_language_pending";

function readStorage(key: string): string | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

export function getDeviceLanguage(): SupportedLanguage {
  return resolveSupportedLanguage(
    readStorage(DEVICE_LANGUAGE_KEY) ?? (typeof navigator !== "undefined" ? navigator.language : undefined),
  );
}

export function rememberDeviceLanguage(language: SupportedLanguage): void {
  try {
    localStorage.setItem(DEVICE_LANGUAGE_KEY, language);
  } catch {
    // Storage unavailable (private mode) — the choice just won't persist.
  }
}

/** Log in / Sign up picker: switch now, and carry the choice into the app. */
export function chooseSignedOutLanguage(language: SupportedLanguage): void {
  i18n.changeLanguage(language);
  rememberDeviceLanguage(language);
  try {
    localStorage.setItem(PENDING_LANGUAGE_KEY, language);
  } catch {
    // See rememberDeviceLanguage.
  }
}

/** Returns (and clears) a language picked on Log in / Sign up, if any. */
export function takePendingLanguageChoice(): SupportedLanguage | null {
  const pending = readStorage(PENDING_LANGUAGE_KEY);
  if (!pending) return null;
  try {
    localStorage.removeItem(PENDING_LANGUAGE_KEY);
  } catch {
    // See rememberDeviceLanguage.
  }
  return resolveSupportedLanguage(pending);
}

i18n.use(initReactI18next).init({
  resources,
  ns: NAMESPACES,
  defaultNS: "common",
  lng: getDeviceLanguage(),
  fallbackLng: DEFAULT_LANGUAGE,
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
});

export default i18n;
