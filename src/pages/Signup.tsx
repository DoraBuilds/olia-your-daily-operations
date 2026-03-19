import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

type Step = "form" | "check-email";

export default function Signup() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [step, setStep] = useState<Step>("form");

  const [businessName, setBusinessName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Already authenticated → go to admin (new users add their first location there)
  useEffect(() => {
    if (user) navigate("/admin", { replace: true });
  }, [user, navigate]);

  const isFormValid =
    businessName.trim().length > 0 &&
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    email.trim().length > 0 &&
    password.length >= 8;

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

    const { data, error: authError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        // After email confirmation, Supabase redirects here. The callback
        // page processes the auth tokens and sends the user to /admin.
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        // Store both fields in auth user metadata so AuthContext can call
        // setup_new_organization even if localStorage is cleared (e.g.
        // when email is confirmed on a different device or browser).
        data: {
          full_name: ownerName,
          business_name: businessName.trim(),
        },
      },
    });

    setLoading(false);

    if (authError) {
      localStorage.removeItem("olia_pending_onboarding");
      setError(authError.message);
      return;
    }

    if (data.session) {
      // Email confirmation is disabled in Supabase settings.
      // AuthContext onAuthStateChange will fire → fetchTeamMember →
      // sees pending onboarding data → calls setup_new_organization.
      // The useEffect above will redirect to /dashboard once user is set.
    } else {
      // Email confirmation required — show instructions.
      setStep("check-email");
    }
  };

  if (step === "check-email") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-sm space-y-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-sage/10 flex items-center justify-center mx-auto text-3xl">
            ✉
          </div>
          <div>
            <h1 className="font-display text-2xl text-foreground">Check your email</h1>
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
              We sent a confirmation link to{" "}
              <span className="text-foreground font-medium">{email}</span>.
              Click it and you'll land straight in your workspace.
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            Already confirmed?{" "}
            <Link to="/kiosk" className="text-sage font-medium hover:underline">
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
          <p className="text-sm text-muted-foreground mt-1">Set up Olia for your business</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Business name */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Business name</label>
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
              The name of your restaurant brand or business.
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

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Password</label>
            <input
              id="signup-password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              minLength={8}
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
            {loading ? "Creating account…" : "Create account"}
          </button>
        </form>

        <p className="text-center text-xs text-muted-foreground">
          Already have an account?{" "}
          <Link to="/kiosk" className="text-sage font-medium hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
