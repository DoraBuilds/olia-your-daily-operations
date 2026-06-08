import { useState, useEffect, useRef } from "react";
import { X, CheckCircle2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface Props {
  open: boolean;
  onClose: () => void;
}

type State = "idle" | "submitting" | "success" | "error";

const inputCls = "w-full border border-border rounded-xl px-4 py-3 text-sm bg-muted focus:outline-none focus:ring-1 focus:ring-ring";

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

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-foreground/20 backdrop-blur-sm sm:items-center sm:px-4 sm:py-8"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="demo-modal-title"
    >
      <div className="bg-card w-full max-w-lg rounded-t-2xl p-5 pb-8 space-y-4 max-h-[85vh] overflow-y-auto sm:max-w-lg sm:rounded-2xl sm:max-h-[90vh] sm:shadow-2xl">

        {state === "success" ? (
          <>
            <div className="flex items-center justify-between">
              <h2 id="demo-modal-title" className="font-display text-lg text-foreground">Book a demo</h2>
              <button onClick={onClose} className="btn-icon">
                <X size={18} className="text-muted-foreground" />
              </button>
            </div>
            <div className="py-4 text-center space-y-3">
              <div className="flex justify-center">
                <div className="w-12 h-12 rounded-2xl bg-sage/10 flex items-center justify-center">
                  <CheckCircle2 size={22} className="text-sage" />
                </div>
              </div>
              <p className="text-sm font-medium text-foreground">You're on the list</p>
              <p className="text-sm text-muted-foreground">
                Thanks, {name.split(" ")[0]}! I'll reach out within one business day.
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-full py-3 rounded-xl text-sm font-medium bg-sage text-primary-foreground hover:bg-sage-deep transition-colors"
            >
              Done
            </button>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 id="demo-modal-title" className="font-display text-lg text-foreground">Book a demo</h2>
              <button type="button" onClick={onClose} className="btn-icon">
                <X size={18} className="text-muted-foreground" />
              </button>
            </div>

            <p className="text-sm text-muted-foreground -mt-1">
              I'll reach out within one business day to find a time.
            </p>

            <div>
              <label htmlFor="demo-name" className="text-xs text-muted-foreground mb-1 block">
                Your name (required)
              </label>
              <input
                ref={nameRef}
                id="demo-name"
                type="text"
                required
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Jane Smith"
                className={inputCls}
              />
            </div>

            <div>
              <label htmlFor="demo-email" className="text-xs text-muted-foreground mb-1 block">
                Work email (required)
              </label>
              <input
                id="demo-email"
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="jane@yourvenue.com"
                className={inputCls}
              />
            </div>

            <div>
              <label htmlFor="demo-venue" className="text-xs text-muted-foreground mb-1 block">
                Venue or property name (optional)
              </label>
              <input
                id="demo-venue"
                type="text"
                value={venue}
                onChange={e => setVenue(e.target.value)}
                placeholder="The Grand Hotel"
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
              {state === "submitting" ? "Sending…" : "Request a demo"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
