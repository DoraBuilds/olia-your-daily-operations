import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { getRuntimeConfig } from "@/lib/runtime-config";
import { buildPublicAuthRedirectUrl } from "@/lib/github-pages-routing";
import { cn } from "@/lib/utils";

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
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();

  const token = searchParams.get("token") ?? "";

  const [step, setStep]           = useState<Step>("loading");
  const [invite, setInvite]       = useState<InviteInfo | null>(null);
  const [code, setCode]           = useState("");
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [info, setInfo]           = useState<string | null>(null);

  // Already signed in — go straight to dashboard
  useEffect(() => {
    if (user) navigate("/dashboard", { replace: true });
  }, [user, navigate]);

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
        setInfo("Too many email attempts. If you already received a code, enter it below.");
        return;
      }
      localStorage.removeItem("olia_pending_invite_token");
      setError(authError.message ?? "Something went wrong. Please try again.");
      return;
    }

    setStep("code");
    setInfo(`We sent a verification code to ${invite.email}.`);
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
      setError(authError.message ?? "That code didn't work. Please try again.");
      return;
    }
    // AuthContext.fetchTeamMember will pick up olia_pending_invite_token
    // and call accept_invite() RPC. Navigation happens via the user effect above.
  };

  // ── Render ──────────────────────────────────────────────────────────

  if (step === "loading") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-sage border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (step === "error") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-sm">
          <h1 className="font-display text-2xl text-foreground mb-3">Invite not found</h1>
          <p className="text-muted-foreground text-sm mb-6">
            This invitation link is invalid or has already been used. Ask your admin to send a new one.
          </p>
          <button
            onClick={() => navigate("/login")}
            className="text-sm text-sage font-medium underline underline-offset-2"
          >
            Sign in instead
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        {/* Header */}
        <div className="text-center space-y-1">
          <h1 className="font-display text-3xl text-foreground">You're invited!</h1>
          {invite && (
            <p className="text-muted-foreground text-sm">
              Join <span className="font-medium text-foreground">{invite.organization_name}</span> on Olia
            </p>
          )}
        </div>

        {/* Card */}
        <div className="bg-card rounded-2xl border border-border p-6 space-y-4">

          {step === "welcome" && (
            <>
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  We'll send a verification code to:
                </p>
                <p className="text-sm font-medium text-foreground bg-muted/40 rounded-lg px-3 py-2 break-all">
                  {invite?.email}
                </p>
              </div>

              {error && (
                <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>
              )}

              <button
                onClick={acceptAndSendCode}
                disabled={loading}
                className="w-full py-3 px-4 rounded-2xl bg-sage text-white font-semibold text-sm
                           hover:bg-sage-deep disabled:opacity-50 transition-colors"
              >
                {loading ? "Sending code…" : "Accept invitation"}
              </button>
            </>
          )}

          {step === "code" && (
            <>
              {info && (
                <p className="text-sm text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">{info}</p>
              )}

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Verification code
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="Enter your code"
                  value={code}
                  onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
                  onKeyDown={e => e.key === "Enter" && verifyCode()}
                  className={cn(
                    "w-full px-4 py-3 rounded-xl border text-sm bg-background",
                    "focus:outline-none focus:ring-2 focus:ring-sage/30 focus:border-sage",
                    error ? "border-destructive" : "border-border",
                  )}
                />
              </div>

              {error && (
                <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>
              )}

              <button
                onClick={verifyCode}
                disabled={loading || code.trim().length < 6}
                className="w-full py-3 px-4 rounded-2xl bg-sage text-white font-semibold text-sm
                           hover:bg-sage-deep disabled:opacity-50 transition-colors"
              >
                {loading ? "Verifying…" : "Verify & sign in"}
              </button>

              <button
                onClick={acceptAndSendCode}
                disabled={loading}
                className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
              >
                Resend code
              </button>
            </>
          )}
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Already have an account?{" "}
          <button
            onClick={() => navigate("/login")}
            className="text-sage font-medium underline underline-offset-2"
          >
            Sign in
          </button>
        </p>
      </div>
    </div>
  );
}
