import { useState, useEffect, useRef } from "react";
import { X, CalendarDays, CheckCircle2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface Props {
  open: boolean;
  onClose: () => void;
}

type State = "idle" | "submitting" | "success" | "error";

export function DemoModal({ open, onClose }: Props) {
  const [name, setName]       = useState("");
  const [email, setEmail]     = useState("");
  const [venue, setVenue]     = useState("");
  const [state, setState]     = useState<State>("idle");
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
      setErrorMsg("Something went wrong. Please email dora@oliahq.com directly.");
      setState("error");
    } else {
      setState("success");
    }
  }

  const inputClass =
    "w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-sage/30 focus:border-sage/50 transition-colors";

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="demo-modal-title"
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <div className="relative w-full max-w-md bg-card rounded-2xl shadow-xl border border-border p-6 sm:p-8">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Close"
          >
            <X size={20} />
          </button>

          {state === "success" ? (
            <div className="text-center py-4">
              <CheckCircle2 size={48} className="mx-auto mb-4" style={{ color: "hsl(var(--sage))" }} />
              <h2 className="font-display text-2xl text-foreground mb-2">You're on the list</h2>
              <p className="text-muted-foreground text-sm">
                Thanks, {name.split(" ")[0]}! I'll reach out within one business day.
              </p>
              <button
                onClick={onClose}
                className="mt-6 inline-flex items-center justify-center font-semibold px-6 py-3 rounded-xl hover:opacity-90 transition-opacity text-white"
                style={{ background: "hsl(var(--sage))" }}
              >
                Done
              </button>
            </div>
          ) : (
            <>
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-1.5">
                  <CalendarDays size={18} className="text-muted-foreground" />
                  <h2 id="demo-modal-title" className="font-display text-2xl text-foreground">
                    Book a demo
                  </h2>
                </div>
                <p className="text-sm text-muted-foreground">
                  I'll reach out within one business day to find a time.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="demo-name" className="block text-sm font-medium text-foreground mb-1.5">
                    Your name
                  </label>
                  <input
                    ref={nameRef}
                    id="demo-name"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Jane Smith"
                    className={inputClass}
                  />
                </div>

                <div>
                  <label htmlFor="demo-email" className="block text-sm font-medium text-foreground mb-1.5">
                    Work email
                  </label>
                  <input
                    id="demo-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="jane@yourvenue.com"
                    className={inputClass}
                  />
                </div>

                <div>
                  <label htmlFor="demo-venue" className="block text-sm font-medium text-foreground mb-1.5">
                    Venue or property name
                    <span className="text-muted-foreground font-normal ml-1">(optional)</span>
                  </label>
                  <input
                    id="demo-venue"
                    type="text"
                    value={venue}
                    onChange={(e) => setVenue(e.target.value)}
                    placeholder="The Grand Hotel"
                    className={inputClass}
                  />
                </div>

                {state === "error" && (
                  <p className="text-sm text-destructive">{errorMsg}</p>
                )}

                <button
                  type="submit"
                  disabled={state === "submitting"}
                  className="w-full font-semibold py-3 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60 text-white"
                  style={{ background: "hsl(var(--sage))" }}
                >
                  {state === "submitting" ? "Sending…" : "Request a demo"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </>
  );
}
