import { useTranslation } from "react-i18next";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface LanguageSwitcherProps {
  value: SupportedLanguage;
  onChange: (language: SupportedLanguage) => void;
  className?: string;
  /**
   * "default" — full-width Select for a settings form (shows the endonym).
   * "pill" — compact rounded-full trigger matching the Kiosk header's
   * Library/Admin buttons (shows a short code); for the guest-facing picker.
   */
  variant?: "default" | "pill";
}

// Endonyms — each language's own name for itself, shown as-is regardless of
// the current UI language, so a reader can recognize their language even
// when the interface isn't in it yet.
const LANGUAGE_ENDONYM: Record<SupportedLanguage, string> = {
  en: "English",
  es: "Español",
};

const LANGUAGE_SHORT_LABEL: Record<SupportedLanguage, string> = {
  en: "EN",
  es: "ES",
};

// Presentational only — callers own where the chosen language is persisted
// (Supabase profile for the staff app, localStorage for the device-scoped
// Kiosk picker; see issue #594).
export function LanguageSwitcher({ value, onChange, className, variant = "default" }: LanguageSwitcherProps) {
  const { t } = useTranslation();
  const isPill = variant === "pill";

  return (
    <Select value={value} onValueChange={(next) => onChange(next as SupportedLanguage)}>
      <SelectTrigger
        className={cn(
          isPill
            ? "w-auto h-auto gap-1.5 rounded-full border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted"
            : "w-full",
          className,
        )}
        aria-label={t("language.label")}
      >
        {isPill ? <span>{LANGUAGE_SHORT_LABEL[value]}</span> : <SelectValue />}
      </SelectTrigger>
      <SelectContent>
        {SUPPORTED_LANGUAGES.map((lang) => (
          <SelectItem key={lang} value={lang}>
            {LANGUAGE_ENDONYM[lang]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
