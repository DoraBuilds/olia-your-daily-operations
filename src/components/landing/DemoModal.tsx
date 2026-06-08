import { useState, useEffect, useRef } from "react";
import { CheckCircle2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface Props {
  open: boolean;
  onClose: () => void;
}

type State = "idle" | "submitting" | "success" | "error";

export function DemoModal({ open, onClose }: Props) {
  const [name, setName]         = useState("");
  const [email, setEmail]       = useState("");
  const [venue, setVenue]       = useState("");
  const [state, setState]       = useState<State>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => nameRef.current?.focus(), 50);
  }, [open]);

  useEffect(() => {
    if (!open) {
      setState("idle");
      setName("");
      setEmail("");
      setVenue("");
      setErrorMsg("");
    }
  }, [open]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState("submitting");

    const { error } = await supabase.from("demo_requests").insert({
      name:       name.trim(),
      email:      email.trim(),
      venue_name: venue.trim() || null,
    });

    if (error) {
      console.error("demo_requests insert:", error);
      setErrorMsg("Something went wrong — please email dora@oliahq.com directly.");
      setState("error");
    } else {
      setState("success");
    }
  }

  const inputClass =
    "w-full border border-border rounded-xl px-4 py-3 text-sm text-foreground bg-card placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-sage/20 focus:border-sage/40 transition-colors";

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-foreground/20 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet — slides up from bottom on mobile, centred on desktop */}
      <div
        className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center sm:px-4 sm:py-8"
        role="dialog"
        aria-modal="true"
        aria-labelledby="demo-modal-title"
      >
        <div
          className="w-full bg-card rounded-t-2xl sm:rounded-2xl sm:max-w-lg sm:max-h-[90vh] sm:overflow-y-auto"
          onClick={e => e.stopPropagation()}
        >
          {state === "success" ? (
            <div className="p-8 text-center space-y-3">
              <div className="flex justify-center mb-2">
                <div className="w-14 h-14 rounded-2xl bg-sage/10 flex items-center justify-center">
                  <CheckCircle2 size={28} className="text-sage" />
                </div>
              </div>
              <h2 className="font-display text-xl text-foreground">You're on the list</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Thanks, {name.split(" ")[0]}! I'll reach out within one business day.
              </p>
              <div className="pt-2 space-y-2">
                <button
                  onClick={onClose}
                  className="w-full py-3 rounded-xl bg-sage text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-5">
              {/* Header */}
              <div className="space-y-1">
                <h2 id="demo-modal-title" className="font-display text-xl text-foreground">
                  Book a demo
                </h2>
                <p className="text-sm text-muted-foreground">
                  I'll reach out within one business day to find a time.
                </p>
              </div>

              {/* Fields */}
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="demo-name" className="block text-sm font-medium text-foreground">
                    Your name
                  </label>
                  <input
                    ref={nameRef}
                    id="demo-name"
                    type="text"
                    required
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Jane Smith"
                    className={inputClass}
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="demo-email" className="block text-sm font-medium text-foreground">
                    Work email
                  </label>
                  <input
                    id="demo-email"
                    type="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="jane@yourvenue.com"
                    className={inputClass}
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="demo-venue" className="block text-sm font-medium text-foreground">
                    Venue or property name
                    <span className="text-muted-foreground font-normal ml-1.5">(optional)</span>
                  </label>
                  <input
                    id="demo-venue"
                    type="text"
                    value={venue}
                    onChange={e => setVenue(e.target.value)}
                    placeholder="The Grand Hotel"
                    className={inputClass}
                  />
                </div>
              </div>

              {state === "error" && (
                <p className="text-sm text-destructive">{errorMsg}</p>
              )}

              {/* Actions */}
              <div className="space-y-2 pt-1">
                <button
                  type="submit"
                  disabled={state === "submitting"}
                  className="w-full py-3 rounded-xl bg-sage text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60"
                >
                  {state === "submitting" ? "Sending…" : "Request a demo"}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full py-3 rounded-xl border border-border text-sm text-muted-foreground hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
