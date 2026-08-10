import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import i18n from "@/lib/i18n";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { getRuntimeConfig } from "@/lib/runtime-config";
import { buildPublicAuthRedirectUrl } from "@/lib/github-pages-routing";
import { legalTheme, legalLinkStyle } from "@/lib/legal-theme";

type Step = "email" | "code";

function isEmailRateLimited(message: string | null | undefined) {
  const normalized = (message ?? "").toLowerCase();
  return normalized.includes("rate limit") || normalized.includes("over_email_send_rate_limit");
}

function isMissingAccount(message: string | null | undefined) {
  const normalized = (message ?? "").toLowerCase();
  return (
    normalized.includes("signups not allowed for otp") ||
    normalized.includes("signup not allowed") ||
    normalized.includes("user not found") ||
    normalized.includes("email not found") ||
    normalized.includes("no account")
  );
}

function getFriendlyAuthError(message: string | null | undefined) {
  if (isMissingAccount(message)) {
    // A first-time invitee lands here if they sign in before ever accepting
    // their invite (no auth account exists yet). Point them back to the
    // invite email rather than just "create one" — creating a new account
    // here would spin up an unrelated organisation instead of joining the
    // team they were invited to.
    return i18n.t("login.missingAccountError", { ns: "auth" });
  }

  return message ?? i18n.t("login.genericError", { ns: "auth" });
}

export default function Login() {
  const { t } = useTranslation("auth");
  const navigate = useNavigate();
  const { user } = useAuth();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    if (user) navigate("/admin", { replace: true });
  }, [user, navigate]);

  const emailValue = email.trim().toLowerCase();
  const authRedirectUrl = buildPublicAuthRedirectUrl(getRuntimeConfig().publicSiteUrl, "/auth/callback");

  const sendCode = async () => {
    if (!emailValue) return;

    setLoading(true);
    setError(null);
    setInfo(null);

    const { error: authError } = await supabase.auth.signInWithOtp({
      email: emailValue,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: authRedirectUrl,
      },
    });

    setLoading(false);

    if (authError) {
      if (isEmailRateLimited(authError.message)) {
        setStep("code");
        setInfo(t("login.rateLimitedInfo"));
      }
      setError(getFriendlyAuthError(authError.message));
      return;
    }

    setStep("code");
    setInfo(t("login.codeSentInfo", { email: emailValue }));
  };

  const verifyCode = async () => {
    if (!emailValue || code.trim().length < 6) return;

    setLoading(true);
    setError(null);

    const { error: authError } = await supabase.auth.verifyOtp({
      email: emailValue,
      token: code.trim(),
      type: "email",
    });

    setLoading(false);

    if (authError) {
      if (isEmailRateLimited(authError.message)) {
        setStep("code");
        setInfo(t("login.rateLimitedInfo"));
      }
      setError(getFriendlyAuthError(authError.message));
      return;
    }

    // Let the useEffect(user → navigate) handle the redirect once AuthContext
    // confirms the session — avoids racing ProtectedRoute which sees user=null
    // before SIGNED_IN is processed and would redirect straight to /login.
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (step === "email") {
      await sendCode();
      return;
    }

    await verifyCode();
  };

  const handleResend = async () => {
    setResending(true);
    setError(null);
    const { error: authError } = await supabase.auth.signInWithOtp({
      email: emailValue,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: authRedirectUrl,
      },
    });
    setResending(false);

    if (authError) {
      setError(getFriendlyAuthError(authError.message));
      return;
    }

    setInfo(t("login.freshCodeSentInfo", { email: emailValue }));
  };

  return (
    <div className="min-h-screen bg-background legal-scope flex flex-col items-center justify-center px-6 py-12" style={legalTheme}>
      <style>{legalLinkStyle}</style>
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <img src="/brand/logo/olia-app-icon.svg" alt="Olia" className="w-14 h-14 mx-auto mb-4" />
          <h1 className="font-display text-2xl text-foreground">{t("login.heading")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("login.subheading")}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">{t("login.email")}</label>
            <input
              autoFocus
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder={t("login.emailPlaceholder")}
              required
              className="w-full border border-border rounded-xl px-4 py-3 text-sm bg-card focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {step === "code" && (
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">{t("login.oneTimeCode")}</label>
              <input
                autoFocus
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
                placeholder={t("login.codePlaceholder")}
                className="w-full border border-border rounded-xl px-4 py-3 text-sm bg-card focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          )}

          {info && (
            <p
              className="text-xs rounded-xl px-3 py-2 border"
              style={{ color: "#007E70", background: "rgba(0,229,204,0.08)", borderColor: "rgba(0,229,204,0.25)" }}
            >
              {info}
            </p>
          )}

          {error && (
            <p className="text-xs text-status-error">{error}</p>
          )}

          {step === "email" && (
            <button
              type="button"
              onClick={() => {
                setStep("code");
                setError(null);
                setInfo(emailValue ? t("login.enterRecentCode", { email: emailValue }) : t("login.enterRecentCodeGeneric"));
              }}
              disabled={!emailValue || loading}
              className="text-xs font-medium hover:underline disabled:opacity-50"
              style={{ color: "#007E70" }}
            >
              {t("login.alreadyHaveCode")}
            </button>
          )}

          <button
            type="submit"
            disabled={loading || !emailValue || (step === "code" && code.trim().length < 6)}
            className={cn(
              "w-full py-3 rounded-full text-sm font-semibold transition-colors",
              !loading && emailValue && (step === "email" || code.trim().length >= 6)
                ? "bg-[#0B0F0C] text-white hover:bg-[#151A16]"
                : "bg-muted text-muted-foreground cursor-not-allowed",
            )}
          >
            {loading ? (step === "email" ? t("login.sendingCode") : t("login.verifying")) : (step === "email" ? t("login.sendCode") : t("login.verifyCode"))}
          </button>
        </form>

        {step === "code" && (
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleResend}
              disabled={resending || loading || !emailValue}
              className="text-xs font-medium hover:underline disabled:opacity-50"
              style={{ color: "#007E70" }}
            >
              {resending ? t("login.resending") : t("login.resendCode")}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep("email");
                setCode("");
                setError(null);
                setInfo(null);
              }}
              className="text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              {t("login.changeEmail")}
            </button>
          </div>
        )}

        <p className="text-center text-xs text-muted-foreground">
          {t("login.needAccount")}{" "}
          <Link to="/signup" className="text-sage font-medium hover:underline">
            {t("login.createOne")}
          </Link>
        </p>
      </div>
    </div>
  );
}
