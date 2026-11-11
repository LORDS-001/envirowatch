/// <reference lib="webworker" />
import { computeGrid, type GridRequest } from "@/lib/idw";

interface Job extends GridRequest {
  id: number;
}

self.onmessage = (e: MessageEvent<Job>) => {
  const { id, ...req } = e.data;
  const result = computeGrid(req);
  (self as unknown as DedicatedWorkerGlobalScope).postMessage({ id, ...result }, [
    result.values.buffer,
    result.alpha.buffer,
  ]);
};
