import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { chooseSignedOutLanguage, resolveSupportedLanguage } from "@/lib/i18n";

// Top-right language pill on Log in / Sign up. The pick sticks on this
// device and is saved to the account once signed in, so the app opens in it.
export function AuthLanguageSwitcher() {
  const { i18n } = useTranslation();
  return (
    <div className="fixed top-5 right-5 z-10">
      <LanguageSwitcher
        variant="pill"
        value={resolveSupportedLanguage(i18n.language)}
        onChange={chooseSignedOutLanguage}
        className="bg-background"
      />
    </div>
  );
}
