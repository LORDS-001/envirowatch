import { useEffect, useRef, useState, useSyncExternalStore } from "react";

/** Element size via ResizeObserver. */
export function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize((s) => (s.width === Math.round(width) && s.height === Math.round(height) ? s : { width: Math.round(width), height: Math.round(height) }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

// One MediaQueryList per query, shared by every subscriber.
const mqls = new Map<string, MediaQueryList>();
const getMql = (query: string) => {
  let mql = mqls.get(query);
  if (!mql) mqls.set(query, (mql = window.matchMedia(query)));
  return mql;
};

/** Whether a media query matches, kept in sync as it changes. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = getMql(query);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => getMql(query).matches,
    () => false,
  );
}

/** Reads the media query directly so JS-driven animation respects it too. */
export function usePrefersReducedMotion(): boolean {
  return useMediaQuery("(prefers-reduced-motion: reduce)");
}

/** Below Tailwind's `sm` (640 px): phones, where tables become cards. */
export const NARROW_QUERY = "(max-width: 639.98px)";

// One shared 1 s clock. Only components that display an age subscribe, so a ticking
// "10 s ago" never re-renders a chart.
let clockNow = Date.now();
let clockTimer: ReturnType<typeof setInterval> | null = null;
const clockListeners = new Set<() => void>();
function subscribeClock(cb: () => void) {
  clockListeners.add(cb);
  if (!clockTimer) {
    clockNow = Date.now();
    clockTimer = setInterval(() => {
      clockNow = Date.now();
      clockListeners.forEach((l) => l());
    }, 1000);
  }
  return () => {
    clockListeners.delete(cb);
    if (clockListeners.size === 0 && clockTimer) {
      clearInterval(clockTimer);
      clockTimer = null;
    }
  };
}

/** Current time from the shared 1 s clock, for ages like "10 s ago". */
export function useNow(): number {
  return useSyncExternalStore(subscribeClock, () => clockNow, () => clockNow);
}

/**
 * Animates a number toward `target` over `durationMs` with the standard ease
 * (cubic-bezier(0.22, 1, 0.36, 1), approximated as ease-out-quint). Instant under reduced motion.
 */
export function useAnimatedNumber(target: number, durationMs: number): number {
  const reduced = usePrefersReducedMotion();
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);
  const skip = reduced || !Number.isFinite(target);
  useEffect(() => {
    if (skip) {
      fromRef.current = target;
      return;
    }
    const from = fromRef.current;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / durationMs);
      const eased = 1 - (1 - p) ** 5;
      const v = from + (target - from) * eased;
      fromRef.current = v;
      setValue(v);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs, skip]);
  return skip ? target : value;
}

/** Resolves a CSS custom property to its computed value (for canvas drawing). */
export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
