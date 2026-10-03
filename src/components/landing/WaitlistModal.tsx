import { useState, useEffect, useRef } from "react";
import { X, CheckCircle2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { captureEvent } from "@/lib/posthog";

interface Props {
  open: boolean;
  onClose: () => void;
}

type State = "idle" | "submitting" | "success" | "error";

const inputCls = "w-full border border-border rounded-xl px-4 py-3 text-sm bg-muted focus:outline-none focus:ring-1 focus:ring-ring";
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const UNIQUE_VIOLATION = "23505";

// Copy kept as plain constants (no i18n; the landing page isn't translated).
const INTRO_TEXT = "Something special is taking shape. We're putting the final polish on Olia. Leave your email and be among the very first to step inside.";
const SUCCESS_TITLE = "You're on the list!";
const SUCCESS_BODY =
  "Thank you for joining. You'll hear from us very soon, and you'll be among the first to step inside.";

export function WaitlistModal({ open, onClose }: Props) {
  const [email, setEmail]       = useState("");
  const [state, setState]       = useState<State>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => emailRef.current?.focus(), 50);
  }, [open]);

  useEffect(() => {
    if (!open) {
      setState("idle");
      setEmail("");
      setErrorMsg("");
    }
  }, [open]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed) || trimmed.length > 254) {
      setErrorMsg("Please enter a valid email address.");
      setState("error");
      return;
    }
    setState("submitting");

    const { error } = await supabase.from("waitlist_signups").insert({ email: trimmed, source: "landing" });

    // A duplicate gets the same success screen as a new signup, so the form
    // can't be used to check whether an address is already on the list.
    if (error && error.code !== UNIQUE_VIOLATION) {
      console.error("waitlist_signups insert:", error);
      setErrorMsg("Something went wrong — please try again, or email dora@oliahq.com.");
      setState("error");
      return;
    }

    captureEvent("waitlist_joined");
    setState("success");
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/20 backdrop-blur-sm px-4 py-8"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="waitlist-modal-title"
    >
      <div className="bg-card w-full max-w-md rounded-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto shadow-2xl">
        {state === "success" ? (
          <>
            <div className="flex items-center justify-between">
              <h2 id="waitlist-modal-title" className="font-display text-lg text-foreground">Join the waitlist</h2>
              <button onClick={onClose} className="btn-icon" aria-label="Close">
                <X size={18} className="text-muted-foreground" />
              </button>
            </div>
            <div className="py-4 text-center space-y-3">
              <div className="flex justify-center">
                <div className="w-12 h-12 rounded-2xl bg-sage/10 flex items-center justify-center">
                  <CheckCircle2 size={22} className="text-sage" />
                </div>
              </div>
              <p className="text-sm font-medium text-foreground">{SUCCESS_TITLE}</p>
              <p className="text-sm text-muted-foreground">{SUCCESS_BODY}</p>
            </div>
            <button
              onClick={onClose}
              className="w-full py-3 rounded-xl text-sm font-medium bg-sage text-primary-foreground hover:bg-sage-deep transition-colors"
            >
              Done
            </button>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div className="flex items-center justify-between">
              <h2 id="waitlist-modal-title" className="font-display text-lg text-foreground">Join the waitlist</h2>
              <button type="button" onClick={onClose} className="btn-icon" aria-label="Close">
                <X size={18} className="text-muted-foreground" />
              </button>
            </div>

            <p className="text-sm text-muted-foreground -mt-1">
              {INTRO_TEXT}
            </p>

            <div>
              <label htmlFor="waitlist-email" className="text-xs text-muted-foreground mb-1 block">
                Email
              </label>
              <input
                ref={emailRef}
                id="waitlist-email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="jane@yourvenue.com"
                className={inputCls}
              />
            </div>

            {state === "error" && (
              <p className="text-sm text-destructive">{errorMsg}</p>
            )}

            <button
              type="submit"
              disabled={state === "submitting"}
              className="w-full py-3 rounded-xl text-sm font-medium bg-sage text-primary-foreground hover:bg-sage-deep transition-colors disabled:opacity-60"
            >
              {state === "submitting" ? "Joining…" : "Join the waitlist"}
            </button>

            <p className="text-center text-xs text-muted-foreground -mt-1">
              We'll only email you about Olia's launch.{" "}
              <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground transition-colors">
                Privacy policy
              </a>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
