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
 * Computes an IDW grid off the main thread. Requests are debounced and coalesced: at most one
 * job is in flight per map, and only the newest pending request is sent when it finishes, so a
 * slow grid can never be starved by faster-changing inputs. Every result is shown when it lands.
 * Falls back to the main thread where workers are unavailable (tests).
 */
export function useIdwGrid(req: GridRequest | null, debounceMs = 120): GridResult | null {
  const [result, setResult] = useState<GridResult | null>(null);
  const inFlight = useRef(false);
  const pending = useRef<GridRequest | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    if (!req) return;
    const send = (r: GridRequest) => {
      const w = getWorker();
      if (!w) {
        setResult(computeGrid(r));
        return;
      }
      inFlight.current = true;
      const id = ++nextId;
      waiting.set(id, (res) => {
        inFlight.current = false;
        if (!alive.current) return;
        setResult(res);
        const next = pending.current;
        pending.current = null;
        if (next) send(next);
      });
      w.postMessage({ id, ...r });
    };
    const handle = setTimeout(() => {
      if (inFlight.current) pending.current = req;
      else send(req);
    }, debounceMs);
    return () => clearTimeout(handle);
  }, [req, debounceMs]);

  return result;
}
