import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { getRuntimeConfig } from "@/lib/runtime-config";
import { buildPublicAuthRedirectUrl } from "@/lib/github-pages-routing";

type Step = "email" | "check-email";

export default function Login() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
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
      setError(authError.message);
      return;
    }

    setStep("check-email");
    setInfo(`We sent a magic link to ${emailValue}.`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await sendCode();
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
      setError(authError.message);
      return;
    }

    setInfo(`We sent a fresh magic link to ${emailValue}.`);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <div className="w-14 h-14 rounded-2xl bg-sage flex items-center justify-center mx-auto mb-4">
            <span className="text-white font-display text-2xl font-bold">O</span>
          </div>
          <h1 className="font-display text-2xl text-foreground">Sign in</h1>
          <p className="text-sm text-muted-foreground mt-1">Use a magic link from your inbox.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Email</label>
            <input
              autoFocus
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@yourbusiness.com"
              required
              className="w-full border border-border rounded-xl px-4 py-3 text-sm bg-card focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {info && (
            <p className="text-xs text-sage-deep bg-sage/10 border border-sage/20 rounded-xl px-3 py-2">
              {info}
            </p>
          )}

          {error && (
            <p className="text-xs text-status-error">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !emailValue}
            className={cn(
              "w-full py-3 rounded-xl text-sm font-semibold transition-colors",
              !loading && emailValue
                ? "bg-sage text-primary-foreground hover:bg-sage-deep"
                : "bg-muted text-muted-foreground cursor-not-allowed",
            )}
          >
            {loading ? "Sending magic link…" : "Send magic link"}
          </button>
        </form>

        {step === "check-email" && (
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleResend}
              disabled={resending || loading || !emailValue}
              className="text-xs font-medium text-sage hover:underline disabled:opacity-50"
            >
              {resending ? "Resending…" : "Resend link"}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep("email");
                setError(null);
                setInfo(null);
              }}
              className="text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              Change email
            </button>
          </div>
        )}

        <p className="text-center text-xs text-muted-foreground">
          Need an account first?{" "}
          <Link to="/signup" className="text-sage font-medium hover:underline">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
