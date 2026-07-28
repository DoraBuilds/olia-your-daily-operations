import { useState, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { getRuntimeConfig } from "@/lib/runtime-config";
import { buildPublicAuthRedirectUrl } from "@/lib/github-pages-routing";

type Step = "form" | "code";

function isEmailRateLimited(message: string | null | undefined) {
  const normalized = (message ?? "").toLowerCase();
  return normalized.includes("rate limit") || normalized.includes("over_email_send_rate_limit");
}

const DEFAULT_ADMIN_PIN_NOTICE_KEY = "olia_default_admin_pin_notice";

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
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 py-12 text-center">
        <div className="w-full max-w-sm space-y-4">
          <img src="/brand/logo/olia-app-icon.svg" alt="Olia" className="w-14 h-14 mx-auto" />
          <h1 className="font-display text-2xl text-foreground">We couldn't verify your invitation</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">{resetDetail}</p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Ask the person who invited you to resend it from Admin → Users, then open the new link they send —
            or try signing in again if you've accepted an invite before.
          </p>
          <Link
            to="/login"
            className="inline-block text-sm text-sage font-medium underline underline-offset-2"
          >
            Sign in instead
          </Link>
        </div>
      </div>
    );
  }

  if (step === "code") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center space-y-3">
            <div className="w-16 h-16 rounded-2xl bg-sage/10 flex items-center justify-center mx-auto text-3xl">
              #
            </div>
            <div>
              <h1 className="font-display text-2xl text-foreground">Enter your code</h1>
              <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                We sent an 8-digit code to{" "}
                <span className="text-foreground font-medium">{email}</span>.
                Enter it here to finish creating your account.
              </p>
            </div>
          </div>

          <form onSubmit={handleVerifyCode} className="space-y-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">One-time code</label>
              <input
                autoFocus
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
                placeholder="Enter the code from your email"
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
                "w-full py-3 rounded-xl text-sm font-semibold transition-colors",
                !loading && code.trim().length >= 6
                  ? "bg-sage text-primary-foreground hover:bg-sage-deep"
                  : "bg-muted text-muted-foreground cursor-not-allowed",
              )}
            >
              {loading ? "Verifying…" : "Verify code"}
            </button>
          </form>

          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleResendCode}
              disabled={resending || loading}
              className="text-xs font-medium text-sage hover:underline disabled:opacity-50"
            >
              {resending ? "Resending…" : "Resend code"}
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
              Change email
            </button>
          </div>

          <p className="text-center text-xs text-muted-foreground">
            Already confirmed?{" "}
            <Link to="/login" className="text-sage font-medium hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm space-y-8">
        {/* Account-reset notice — shown when redirected from a broken auth state.
            isInviteFailure returns its own screen above, so this only covers
            genuine setup failures (e.g. a new owner's org creation didn't finish). */}
        {accountReset && (
          <div className="rounded-xl bg-status-warn/10 border border-status-warn/20 px-4 py-3 text-sm text-foreground leading-relaxed">
            <p className="font-medium mb-0.5">Your account setup didn't finish.</p>
            <p className="text-muted-foreground text-xs">
              {resetDetail ?? "Please create your account again to get started."}
            </p>
          </div>
        )}

        {/* Account-deleted notice */}
        {accountDeleted && (
          <div className="rounded-xl bg-muted border border-border px-4 py-3 text-sm text-foreground leading-relaxed">
            <p className="font-medium mb-0.5">Your account has been deleted.</p>
            <p className="text-muted-foreground text-xs">All data has been permanently removed. You can create a new account below.</p>
          </div>
        )}

        {/* Logo */}
        <div className="text-center">
          <img src="/brand/logo/olia-app-icon.svg" alt="Olia" className="w-14 h-14 mx-auto mb-4" />
          <h1 className="font-display text-2xl text-foreground">Create your account</h1>
          <p className="text-sm text-muted-foreground mt-1">Set up Olia for your business with a one-time code</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Brand name */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Brand name</label>
            <input
              autoFocus
              id="signup-business-name"
              type="text"
              value={businessName}
              onChange={e => setBusinessName(e.target.value)}
              placeholder="e.g. The Crown Restaurant"
              required
              className="w-full border border-border rounded-xl px-4 py-3 text-sm bg-card focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              The name of your brand or restaurant.
            </p>
          </div>

          {/* First name + Last name */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs text-muted-foreground mb-1 block">First name</label>
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
              <label className="text-xs text-muted-foreground mb-1 block">Last name</label>
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
            <label className="text-xs text-muted-foreground mb-1 block">Email</label>
            <input
              id="signup-email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@yourbusiness.com"
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
              "w-full py-3 rounded-xl text-sm font-semibold transition-colors mt-2",
              !loading && isFormValid
                ? "bg-sage text-primary-foreground hover:bg-sage-deep"
                : "bg-muted text-muted-foreground cursor-not-allowed"
            )}
          >
            {loading ? "Sending code…" : "Create account"}
          </button>
        </form>

        <p className="text-center text-xs text-muted-foreground">
          Already have an account?{" "}
          <Link to="/login" className="text-sage font-medium hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
