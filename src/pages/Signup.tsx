import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
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

  // Already authenticated → go to admin (new users add their first location there)
  useEffect(() => {
    if (user) navigate("/admin", { replace: true });
  }, [user, navigate]);

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
      localStorage.removeItem("olia_pending_onboarding");
      if (isEmailRateLimited(authError.message)) {
        setStep("code");
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
      type: "signup",
    });

    setLoading(false);

    if (authError) {
      setError(authError.message);
      return;
    }

    localStorage.setItem(DEFAULT_ADMIN_PIN_NOTICE_KEY, "1");
    navigate("/admin", { replace: true });
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
        {/* Logo */}
        <div className="text-center">
          <div className="w-14 h-14 rounded-2xl bg-sage flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-display text-2xl font-bold">O</span>
          </div>
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
