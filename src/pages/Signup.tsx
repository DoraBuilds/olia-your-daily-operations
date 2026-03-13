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
  const [locationName, setLocationName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Already authenticated → go to dashboard
  useEffect(() => {
    if (user) navigate("/dashboard", { replace: true });
  }, [user, navigate]);

  const isFormValid =
    businessName.trim().length > 0 &&
    locationName.trim().length > 0 &&
    email.trim().length > 0 &&
    password.length >= 8;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid) return;

    setLoading(true);
    setError(null);

    // Store onboarding data before signUp — AuthContext reads this after the
    // user's session is established (either immediately or post-email-confirm).
    localStorage.setItem(
      "olia_pending_onboarding",
      JSON.stringify({
        businessName: businessName.trim(),
        locationName: locationName.trim(),
        ownerName: ownerName.trim() || businessName.trim(),
      })
    );

    const { data, error: authError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { full_name: ownerName.trim() || businessName.trim() },
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
              Click it and you'll land straight in your dashboard.
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
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">First location name</label>
            <input
              id="signup-location-name"
              type="text"
              value={locationName}
              onChange={e => setLocationName(e.target.value)}
              placeholder="e.g. Main Branch"
              required
              className="w-full border border-border rounded-xl px-4 py-3 text-sm bg-card focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Your name <span className="text-muted-foreground/60">(optional)</span>
            </label>
            <input
              id="signup-owner-name"
              type="text"
              value={ownerName}
              onChange={e => setOwnerName(e.target.value)}
              placeholder="e.g. Sarah Johnson"
              className="w-full border border-border rounded-xl px-4 py-3 text-sm bg-card focus:outline-none focus:ring-1 focus:ring-ring"
            />
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
