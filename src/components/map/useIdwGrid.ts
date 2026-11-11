import { useEffect, useRef, useState } from "react";
import { computeGrid, type GridRequest, type GridResult } from "@/lib/idw";

let worker: Worker | null = null;
let nextId = 0;
const waiting = new Map<number, (r: GridResult) => void>();

function getWorker(): Worker | null {
  if (worker) return worker;
  if (typeof Worker === "undefined") return null;
  worker = new Worker(new URL("./idw.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (e: MessageEvent<GridResult & { id: number }>) => {
    const { id, ...result } = e.data;
    waiting.get(id)?.(result);
    waiting.delete(id);
  };
  return worker;
}

/**
 * Computes an IDW grid off the main thread, debounced. Falls back to the main thread where
 * workers are unavailable (tests).
 */
export function useIdwGrid(req: GridRequest | null, debounceMs = 120): GridResult | null {
  const [result, setResult] = useState<GridResult | null>(null);
  const latest = useRef(0);

  useEffect(() => {
    if (!req) return;
    const handle = setTimeout(() => {
      const w = getWorker();
      if (!w) {
        setResult(computeGrid(req));
        return;
      }
      const id = ++nextId;
      latest.current = id;
      waiting.set(id, (r) => {
        if (latest.current === id) setResult(r);
      });
      w.postMessage({ id, ...req });
    }, debounceMs);
    return () => clearTimeout(handle);
  }, [req, debounceMs]);

  return result;
}
