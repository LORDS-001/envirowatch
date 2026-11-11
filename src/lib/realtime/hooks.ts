import { useQuery } from "@tanstack/react-query";
import { emptySnapshot, type LiveSnapshot } from "./reducer";
import { LIVE_KEY } from "./client";

/**
 * Reads a slice of the live snapshot. The snapshot changes at most once per second, and
 * components re-render only when their selected slice changes.
 */
export function useLive<T>(select: (s: LiveSnapshot) => T): T {
  const { data } = useQuery({
    queryKey: LIVE_KEY,
    queryFn: () => emptySnapshot(),
    staleTime: Infinity,
    gcTime: Infinity,
    structuralSharing: false,
    select,
  });
  return data ?? select(emptySnapshot());
}
