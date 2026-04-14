import { useState, useEffect, useRef } from "react";

// ─── useLiveClock ─────────────────────────────────────────────────────────────
export function useLiveClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    if (import.meta.env.TEST) return;
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

// ─── useInactivityTimer ───────────────────────────────────────────────────────
export function useInactivityTimer(active: boolean, onTimeout: () => void) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const stateRef = useRef({
    inCountdown: false,
    mainTimer: null as ReturnType<typeof setTimeout> | null,
    countdownTimer: null as ReturnType<typeof setInterval> | null,
  });
  const onTimeoutRef = useRef(onTimeout);
  const cancelFnRef = useRef<() => void>(() => {});
  onTimeoutRef.current = onTimeout;

  useEffect(() => {
    if (!active || import.meta.env.TEST) return;
    const s = stateRef.current;

    const startCountdown = () => {
      s.inCountdown = true;
      setSecondsLeft(10);
      s.countdownTimer = setInterval(() => {
        setSecondsLeft(prev => {
          if (prev === null || prev <= 1) {
            clearInterval(s.countdownTimer!);
            s.countdownTimer = null;
            onTimeoutRef.current();
            return null;
          }
          return prev - 1;
        });
      }, 1000);
    };

    const reset = () => {
      if (s.inCountdown) return;
      if (s.mainTimer) clearTimeout(s.mainTimer);
      s.mainTimer = setTimeout(startCountdown, 80000);
    };

    cancelFnRef.current = () => {
      s.inCountdown = false;
      if (s.countdownTimer) clearInterval(s.countdownTimer);
      s.countdownTimer = null;
      setSecondsLeft(null);
      reset();
    };

    reset();
    const events = ["mousemove", "keydown", "touchstart", "click"] as const;
    events.forEach(e => window.addEventListener(e, reset));

    return () => {
      events.forEach(e => window.removeEventListener(e, reset));
      if (s.mainTimer) clearTimeout(s.mainTimer);
      if (s.countdownTimer) clearInterval(s.countdownTimer);
      s.inCountdown = false;
    };
  }, [active]);

  return { secondsLeft, cancelCountdown: () => cancelFnRef.current() };
}
