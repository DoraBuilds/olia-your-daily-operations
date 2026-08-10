import { useState, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { getRuntimeConfig } from "@/lib/runtime-config";
import { buildPublicAuthRedirectUrl } from "@/lib/github-pages-routing";
import { legalTheme, legalLinkStyle } from "@/lib/legal-theme";

type Step = "form" | "code";

function isEmailRateLimited(message: string | null | undefined) {
  const normalized = (message ?? "").toLowerCase();
  return normalized.includes("rate limit") || normalized.includes("over_email_send_rate_limit");
}

const DEFAULT_ADMIN_PIN_NOTICE_KEY = "olia_default_admin_pin_notice";

function SignupHeader() {
  return (
    <Link
      to="/"
      className="fixed top-6 left-6 flex items-center gap-2 text-lg hover:opacity-70 transition-opacity"
      style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontWeight: 600, color: "hsl(var(--foreground))" }}
    >
      <img src="/brand/logo/olia-mark-dark.svg" alt="" className="w-6 h-6" />
      Olia
    </Link>
  );
}

export default function Signup() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const accountReset = searchParams.get("reason") === "account-reset";
  const accountDeleted = searchParams.get("reason") === "account-deleted";
  const resetDetail = searchParams.get("detail");
  // Invite failures must never tell the user to "create a new account" — doing
  // so creates an unrelated new organisation instead of joining the one they
  // were invited to. Detect this case from the specific setupError reason
  // (see AuthContext's accept_invite failure message) and show a distinct
  // recovery path instead of the generic signup form.
  const isInviteFailure = accountReset && !!resetDetail && /invit/i.test(resetDetail);
  const { t } = useTranslation("auth");
  const { user } = useAuth();
  const [step, setStep] = useState<Step>("form");
  const [businessName, setBusinessName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Already authenticated → go to admin (new users add their first location there).
  // Skip when reason=account-reset / account-deleted: we arrived here from Admin
  // after navigating before signOut fires. The user is still set at this moment —
  // if we redirect back to /admin we'd create an infinite loop.
  const skipRedirect = accountReset || accountDeleted;
  useEffect(() => {
    if (user && !skipRedirect) navigate("/admin", { replace: true });
  }, [user, navigate, skipRedirect]);

  const isFormValid =
    businessName.trim().length > 0 &&
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    email.trim().length > 0;
  const authRedirectUrl = buildPublicAuthRedirectUrl(getRuntimeConfig().publicSiteUrl, "/auth/callback");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid) return;

    setLoading(true);
    setError(null);

    const ownerName = `${firstName.trim()} ${lastName.trim()}`;

    // Store onboarding data before signUp — AuthContext reads this after the
    // user's session is established (either immediately or post-email-confirm).
    localStorage.setItem(
      "olia_pending_onboarding",
      JSON.stringify({
        businessName: businessName.trim(),
        ownerName,
      })
    );

    const { data, error: authError } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        emailRedirectTo: authRedirectUrl,
        shouldCreateUser: true,
        data: {
          full_name: ownerName,
          business_name: businessName.trim(),
        },
      },
    });

    setLoading(false);

    if (authError) {
      if (isEmailRateLimited(authError.message)) {
        // Rate limited but user may have a valid code from an earlier email — keep
        // the pending onboarding data so setup completes if they verify successfully.
        setStep("code");
      } else {
        localStorage.removeItem("olia_pending_onboarding");
      }
      setError(authError.message);
      return;
    }

    localStorage.setItem(DEFAULT_ADMIN_PIN_NOTICE_KEY, "1");

    if (data.session) {
      // Some environments may sign the user in immediately.
    } else {
      setStep("code");
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.trim().length < 6) return;

    setLoading(true);
    setError(null);

    const { error: authError } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: code.trim(),
      type: "email",
    });

    setLoading(false);

    if (authError) {
      setError(authError.message);
      return;
    }

    localStorage.setItem(DEFAULT_ADMIN_PIN_NOTICE_KEY, "1");
    // Don't navigate here — let the useEffect below react to user being set
    // in AuthContext. Navigating immediately races with ProtectedRoute which
    // sees user=null before the SIGNED_IN event is processed and redirects to /login.
  };

  const handleResendCode = async () => {
    if (!isFormValid) return;

    setResending(true);
    setError(null);

    const ownerName = `${firstName.trim()} ${lastName.trim()}`;
    const { error: authError } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        emailRedirectTo: authRedirectUrl,
        shouldCreateUser: true,
        data: {
          full_name: ownerName,
          business_name: businessName.trim(),
        },
      },
    });

    setResending(false);

    if (authError) {
      if (isEmailRateLimited(authError.message)) {
        setStep("code");
      }
      setError(authError.message);
    }
  };

  if (isInviteFailure) {
    return (
      <div className="min-h-screen bg-background legal-scope flex flex-col items-center justify-center px-6 py-12 text-center" style={legalTheme}>
        <style>{legalLinkStyle}</style>
        <SignupHeader />
        <div className="w-full max-w-sm space-y-4">
          <img src="/brand/logo/olia-app-icon.svg" alt="Olia" className="w-14 h-14 mx-auto" />
          <h1 className="font-display text-2xl text-foreground">{t("signup.inviteFailureTitle")}</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">{resetDetail}</p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {t("signup.inviteFailureHint")}
          </p>
          <Link
            to="/login"
            className="inline-block text-sm text-sage font-medium underline underline-offset-2"
          >
            {t("signup.signInInstead")}
          </Link>
        </div>
      </div>
    );
  }

  if (step === "code") {
    return (
      <div className="min-h-screen bg-background legal-scope flex flex-col items-center justify-center px-6" style={legalTheme}>
        <style>{legalLinkStyle}</style>
        <SignupHeader />
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center space-y-3">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto text-3xl"
              style={{ background: "rgba(0,229,204,0.1)" }}
            >
              #
            </div>
            <div>
              <h1 className="font-display text-2xl text-foreground">{t("signup.enterCodeTitle")}</h1>
              <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                {t("signup.enterCodeBody")}{" "}
                <span className="text-foreground font-medium">{email}</span>.
                {t("signup.enterCodeSuffix")}
              </p>
            </div>
          </div>

          <form onSubmit={handleVerifyCode} className="space-y-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">{t("signup.oneTimeCode")}</label>
              <input
                autoFocus
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
                placeholder={t("signup.codePlaceholder")}
                className="w-full border border-border rounded-xl px-4 py-3 text-sm bg-card focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            {error && (
              <p id="signup-error" className="text-xs text-status-error">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading || code.trim().length < 6}
              className={cn(
                "w-full py-3 rounded-full text-sm font-semibold transition-colors",
                !loading && code.trim().length >= 6
                  ? "bg-[#0B0F0C] text-white hover:bg-[#151A16]"
                  : "bg-muted text-muted-foreground cursor-not-allowed",
              )}
            >
              {loading ? t("signup.verifying") : t("signup.verifyCode")}
            </button>
          </form>

          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleResendCode}
              disabled={resending || loading}
              className="text-xs font-medium hover:underline disabled:opacity-50"
              style={{ color: "#007E70" }}
            >
              {resending ? t("signup.resending") : t("signup.resendCode")}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep("form");
                setCode("");
                setError(null);
              }}
              className="text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              {t("signup.changeEmail")}
            </button>
          </div>

          <p className="text-center text-xs text-muted-foreground">
            {t("signup.alreadyConfirmed")}{" "}
            <Link to="/login" className="text-sage font-medium hover:underline">
              {t("signup.signIn")}
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background legal-scope flex flex-col items-center justify-center px-6 py-12" style={legalTheme}>
      <style>{legalLinkStyle}</style>
      <SignupHeader />
      <div className="w-full max-w-sm space-y-8">
        {/* Account-reset notice — shown when redirected from a broken auth state.
            isInviteFailure returns its own screen above, so this only covers
            genuine setup failures (e.g. a new owner's org creation didn't finish). */}
        {accountReset && (
          <div className="rounded-xl bg-status-warn/10 border border-status-warn/20 px-4 py-3 text-sm text-foreground leading-relaxed">
            <p className="font-medium mb-0.5">{t("signup.accountSetupNotFinished")}</p>
            <p className="text-muted-foreground text-xs">
              {resetDetail ?? t("signup.createAccountAgain")}
            </p>
          </div>
        )}

        {/* Account-deleted notice */}
        {accountDeleted && (
          <div className="rounded-xl bg-muted border border-border px-4 py-3 text-sm text-foreground leading-relaxed">
            <p className="font-medium mb-0.5">{t("signup.accountDeleted")}</p>
            <p className="text-muted-foreground text-xs">{t("signup.accountDeletedBody")}</p>
          </div>
        )}

        {/* Logo */}
        <div className="text-center">
          <img src="/brand/logo/olia-app-icon.svg" alt="Olia" className="w-14 h-14 mx-auto mb-4" />
          <h1 className="font-display text-2xl text-foreground">{t("signup.heading")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("signup.subheading")}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Brand name */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">{t("signup.brandNameLabel")}</label>
            <input
              autoFocus
              id="signup-business-name"
              type="text"
              value={businessName}
              onChange={e => setBusinessName(e.target.value)}
              placeholder={t("signup.brandNamePlaceholder")}
              required
              className="w-full border border-border rounded-xl px-4 py-3 text-sm bg-card focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              {t("signup.brandNameHint")}
            </p>
          </div>

          {/* First name + Last name */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs text-muted-foreground mb-1 block">{t("signup.firstName")}</label>
              <input
                id="signup-first-name"
                type="text"
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
                placeholder="Sarah"
                required
                className="w-full border border-border rounded-xl px-4 py-3 text-sm bg-card focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-muted-foreground mb-1 block">{t("signup.lastName")}</label>
              <input
                id="signup-last-name"
                type="text"
                value={lastName}
                onChange={e => setLastName(e.target.value)}
                placeholder="Johnson"
                required
                className="w-full border border-border rounded-xl px-4 py-3 text-sm bg-card focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">{t("signup.email")}</label>
            <input
              id="signup-email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder={t("signup.emailPlaceholder")}
              required
              className="w-full border border-border rounded-xl px-4 py-3 text-sm bg-card focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {error && (
            <p id="signup-error" className="text-xs text-status-error">{error}</p>
          )}

          <button
            id="signup-submit"
            type="submit"
            disabled={loading || !isFormValid}
            className={cn(
              "w-full py-3 rounded-full text-sm font-semibold transition-colors mt-2",
              !loading && isFormValid
                ? "bg-[#0B0F0C] text-white hover:bg-[#151A16]"
                : "bg-muted text-muted-foreground cursor-not-allowed"
            )}
          >
            {loading ? t("signup.sendingCode") : t("signup.createAccount")}
          </button>
        </form>

        <p className="text-center text-xs text-muted-foreground">
          {t("signup.alreadyHaveAccount")}{" "}
          <Link to="/login" className="text-sage font-medium hover:underline">
            {t("signup.signInLink")}
          </Link>
        </p>
      </div>
    </div>
  );
}
