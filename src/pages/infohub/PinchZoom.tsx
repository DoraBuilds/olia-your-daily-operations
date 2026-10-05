import { useLayoutEffect, useEffect, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";

const MAX_SCALE = 5;
const DOUBLE_TAP_SCALE = 2.5;

/**
 * Pinch-to-zoom + double-tap zoom for previews. Zooming grows the content box
 * inside a native scroller, so panning while zoomed is plain scrolling.
 * `fill` sizes the content to the container (images); otherwise height follows
 * the content (PDF pages).
 */
export function PinchZoom({ children, fill = false }: { children: ReactNode; fill?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const scaleRef = useRef(1);
  const anchor = useRef<{ cx: number; cy: number; px: number; py: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    const a = anchor.current;
    if (!el || !a) return;
    el.scrollLeft = a.cx * el.scrollWidth - a.px;
    el.scrollTop = a.cy * el.scrollHeight - a.py;
    anchor.current = null;
  }, [scale]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const zoomTo = (next: number, clientX: number, clientY: number) => {
      const rect = el.getBoundingClientRect();
      const px = clientX - rect.left;
      const py = clientY - rect.top;
      anchor.current = {
        cx: (el.scrollLeft + px) / el.scrollWidth,
        cy: (el.scrollTop + py) / el.scrollHeight,
        px,
        py,
      };
      const clamped = Math.min(MAX_SCALE, Math.max(1, next));
      scaleRef.current = clamped;
      flushSync(() => setScale(clamped));
    };

    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    let startDist = 0;
    let startScale = 1;
    let lastTap = 0;
    let moved = false;

    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        startDist = dist(e.touches);
        startScale = scaleRef.current;
      }
      moved = false;
    };
    const onMove = (e: TouchEvent) => {
      moved = true;
      if (e.touches.length !== 2 || !startDist) return;
      e.preventDefault();
      const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      zoomTo(startScale * (dist(e.touches) / startDist), midX, midY);
    };
    const onEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) startDist = 0;
      if (e.touches.length === 0 && e.changedTouches.length === 1 && !moved) {
        const now = Date.now();
        if (now - lastTap < 300) {
          const t = e.changedTouches[0];
          zoomTo(scaleRef.current > 1 ? 1 : DOUBLE_TAP_SCALE, t.clientX, t.clientY);
          lastTap = 0;
        } else {
          lastTap = now;
        }
      }
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
    };
  }, []);

  return (
    <div
      ref={ref}
      className="w-full h-full overflow-auto overscroll-contain [touch-action:pan-x_pan-y] [-webkit-overflow-scrolling:touch]"
      data-testid="pinch-zoom"
    >
      <div
        className="mx-auto"
        style={{ width: `${scale * 100}%`, height: fill ? `${scale * 100}%` : undefined }}
      >
        {children}
      </div>
    </div>
  );
}
