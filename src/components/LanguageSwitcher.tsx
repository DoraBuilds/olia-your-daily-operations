import { useTranslation } from "react-i18next";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface LanguageSwitcherProps {
  value: SupportedLanguage;
  onChange: (language: SupportedLanguage) => void;
  className?: string;
}

// Endonyms — each language's own name for itself, shown as-is regardless of
// the current UI language, so a reader can recognize their language even
// when the interface isn't in it yet.
const LANGUAGE_ENDONYM: Record<SupportedLanguage, string> = {
  en: "English",
  es: "Español",
};

// Presentational only — callers own where the chosen language is persisted
// (Supabase profile for the staff app, localStorage for the device-scoped
// Kiosk picker; see issue #594).
export function LanguageSwitcher({ value, onChange, className }: LanguageSwitcherProps) {
  const { t } = useTranslation();

  return (
    <Select value={value} onValueChange={(next) => onChange(next as SupportedLanguage)}>
      <SelectTrigger className={cn("w-full", className)} aria-label={t("language.label")}>
        <SelectValue />
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
