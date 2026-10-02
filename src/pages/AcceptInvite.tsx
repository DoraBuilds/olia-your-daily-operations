import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { getRuntimeConfig } from "@/lib/runtime-config";
import { buildPublicAuthRedirectUrl } from "@/lib/github-pages-routing";
import { cn } from "@/lib/utils";
import { legalTheme, legalLinkStyle } from "@/lib/legal-theme";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";
import { AuthLanguageSwitcher } from "@/components/AuthLanguageSwitcher";

type Step = "loading" | "welcome" | "code" | "error";

interface InviteInfo {
  email: string;
  organization_name: string;
}

function isEmailRateLimited(message: string | null | undefined) {
  const normalized = (message ?? "").toLowerCase();
  return normalized.includes("rate limit") || normalized.includes("over_email_send_rate_limit");
}

export default function AcceptInvite() {
  useDocumentMeta("You're invited — Olia", "Accept your invitation to join your team on Olia.");
  const { t } = useTranslation("auth");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, teamMember, retrySetup, signOut } = useAuth();

  const token = searchParams.get("token") ?? "";

  const [step, setStep]           = useState<Step>("loading");
  const [invite, setInvite]       = useState<InviteInfo | null>(null);
  const [code, setCode]           = useState("");
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [info, setInfo]           = useState<string | null>(null);

  // Already signed in. Opening an invite link while a session exists (e.g. a
  // platform admin who is invited into a customer org) must not just bounce to
  // the dashboard — the invite would never be linked and they'd land on the
  // support console. Accept it for the matching account instead.
  const [signedInMismatch, setSignedInMismatch] = useState(false);
  const acceptingSignedIn = useRef(false);
  useEffect(() => {
    if (!user) return;
    if (teamMember || step === "error") {
      navigate("/dashboard", { replace: true });
      return;
    }
    if (!invite || acceptingSignedIn.current) return;
    if (user.email?.toLowerCase() !== invite.email.toLowerCase()) {
      setSignedInMismatch(true);
      return;
    }
    acceptingSignedIn.current = true;
    (async () => {
      const { data } = await supabase.rpc("accept_invite", { p_token: token });
      if (data?.success) retrySetup();
      else navigate("/dashboard", { replace: true });
    })();
  }, [user, teamMember, invite, step, token, navigate, retrySetup]);

  // Validate the token on mount
  useEffect(() => {
    if (!token) {
      setStep("error");
      return;
    }
    (async () => {
      const { data, error: rpcError } = await supabase.rpc("validate_invite_token", {
        p_token: token,
      });
      if (rpcError || !data?.valid) {
        setStep("error");
        return;
      }
      setInvite({ email: data.email, organization_name: data.organization_name });
      setStep("welcome");
    })();
  }, [token]);

  const authRedirectUrl = buildPublicAuthRedirectUrl(
    getRuntimeConfig().publicSiteUrl,
    "/auth/callback",
  );

  const acceptAndSendCode = async () => {
    if (!invite) return;
    setLoading(true);
    setError(null);

    // Store token so AuthContext can link the auth account after OTP
    localStorage.setItem("olia_pending_invite_token", token);

    const { error: authError } = await supabase.auth.signInWithOtp({
      email: invite.email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: authRedirectUrl,
      },
    });

    setLoading(false);

    if (authError) {
      if (isEmailRateLimited(authError.message)) {
        setStep("code");
        setInfo(t("acceptInvite.rateLimitedInfo"));
        return;
      }
      localStorage.removeItem("olia_pending_invite_token");
      setError(authError.message ?? t("acceptInvite.genericError"));
      return;
    }

    setStep("code");
    setInfo(t("acceptInvite.codeSentInfo", { email: invite.email }));
  };

  const verifyCode = async () => {
    if (!invite || code.trim().length < 6) return;
    setLoading(true);
    setError(null);

    const { error: authError } = await supabase.auth.verifyOtp({
      email: invite.email,
      token: code.trim(),
      type: "email",
    });

    setLoading(false);

    if (authError) {
      setError(authError.message ?? t("acceptInvite.codeFailedError"));
      return;
    }
    // AuthContext.fetchTeamMember will pick up olia_pending_invite_token
    // and call accept_invite() RPC. Navigation happens via the user effect above.
  };

  // ── Render ──────────────────────────────────────────────────────────
  // Same white/black/teal shell as Login so the invite doesn't feel like a
  // different product.

  const shell = (children: React.ReactNode) => (
    <div className="min-h-screen bg-background legal-scope flex flex-col items-center justify-start px-6 pt-[14vh] pb-12" style={legalTheme}>
      <style>{legalLinkStyle}</style>
      <AuthLanguageSwitcher />
      <div className="w-full max-w-sm space-y-8">{children}</div>
    </div>
  );

  const logo = <img src="/brand/logo/olia-mark-dark.svg" alt="Olia" className="w-14 h-14 mx-auto mb-4" />;

  const primaryButton = (enabled: boolean) =>
    cn(
      "w-full py-3 rounded-full text-sm font-semibold transition-colors",
      enabled ? "bg-[#0B0F0C] text-white hover:bg-[#151A16]" : "bg-muted text-muted-foreground cursor-not-allowed",
    );

  const inputClass = "w-full border border-border rounded-xl px-4 py-3 text-sm bg-card focus:outline-none focus:ring-1 focus:ring-ring";

  if (user && signedInMismatch) {
    return shell(
      <div className="text-center">
        {logo}
        <h1 className="font-display text-2xl text-foreground">{t("acceptInvite.youAreInvited")}</h1>
        <p className="text-sm text-muted-foreground mt-1 mb-6">
          {t("acceptInvite.wrongAccount", { current: user.email, invited: invite?.email })}
        </p>
        <button
          onClick={() => { void signOut(); }}
          className="w-full py-3 rounded-full text-sm font-semibold bg-[#0B0F0C] text-white hover:bg-[#151A16] transition-colors"
        >
          {t("acceptInvite.signOutToAccept")}
        </button>
      </div>,
    );
  }

  if (step === "loading" || user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center" style={legalTheme}>
        <div className="w-8 h-8 border-2 border-foreground/70 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (step === "error") {
    return shell(
      <div className="text-center">
        {logo}
        <h1 className="font-display text-2xl text-foreground">{t("acceptInvite.notFoundTitle")}</h1>
        <p className="text-sm text-muted-foreground mt-1 mb-6">{t("acceptInvite.notFoundBody")}</p>
        <button
          onClick={() => navigate("/login")}
          className="w-full py-3 rounded-full text-sm font-semibold bg-[#0B0F0C] text-white hover:bg-[#151A16] transition-colors"
        >
          {t("acceptInvite.signInInstead")}
        </button>
      </div>,
    );
  }

  return shell(
    <>
      <div className="text-center">
        {logo}
        <h1 className="font-display text-2xl text-foreground">{t("acceptInvite.youAreInvited")}</h1>
        {invite && (
          <p className="text-sm text-muted-foreground mt-1">
            {t("acceptInvite.joinOrgPrefix")} <span className="font-medium text-foreground">{invite.organization_name}</span> {t("acceptInvite.joinOrgSuffix")}
          </p>
        )}
      </div>

      <div className="space-y-4">
        {step === "welcome" && (
          <>
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">{t("acceptInvite.willSendCode")}</p>
              <p className="text-sm font-medium text-foreground border border-border rounded-xl bg-card px-4 py-3 break-all">
                {invite?.email}
              </p>
            </div>

            {error && <p className="text-xs text-status-error">{error}</p>}

            <button onClick={acceptAndSendCode} disabled={loading} className={primaryButton(!loading)}>
              {loading ? t("acceptInvite.sendingCode") : t("acceptInvite.acceptInvitation")}
            </button>
          </>
        )}

        {step === "code" && (
          <>
            {info && (
              <p
                className="text-xs rounded-xl px-3 py-2 border"
                style={{ color: "#007E70", background: "rgba(0,229,204,0.08)", borderColor: "rgba(0,229,204,0.25)" }}
              >
                {info}
              </p>
            )}

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">{t("acceptInvite.verificationCode")}</label>
              <input
                autoFocus
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder={t("acceptInvite.codePlaceholder")}
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
                onKeyDown={e => e.key === "Enter" && verifyCode()}
                className={cn(inputClass, error && "border-destructive")}
              />
            </div>

            {error && <p className="text-xs text-status-error">{error}</p>}

            <button
              onClick={verifyCode}
              disabled={loading || code.trim().length < 6}
              className={primaryButton(!loading && code.trim().length >= 6)}
            >
              {loading ? t("acceptInvite.verifying") : t("acceptInvite.verifyAndSignIn")}
            </button>

            <button
              onClick={acceptAndSendCode}
              disabled={loading}
              className="text-xs font-medium hover:underline disabled:opacity-50"
              style={{ color: "#007E70" }}
            >
              {t("acceptInvite.resendCode")}
            </button>
          </>
        )}
      </div>

      <p className="text-center text-xs text-muted-foreground">
        {t("acceptInvite.alreadyHaveAccount")}{" "}
        <Link to="/login" className="font-medium hover:underline">
          {t("acceptInvite.signIn")}
        </Link>
      </p>
    </>,
  );
}
