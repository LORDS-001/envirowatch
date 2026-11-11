import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/endpoints";
import type { DataState } from "@/components/ui/StateIcon";

export function usePublicSummary() {
  return useQuery({ queryKey: ["public", "summary"], queryFn: ({ signal }) => api.publicSummary(signal), refetchInterval: 60_000 });
}

export interface Band {
  word: string;
  state: DataState;
  advice: string;
  range: string;
}

/** PM2.5 bands in plain language. Same breakpoints as the operator alerts (35 and 55 µg/m³). */
export const BANDS: Band[] = [
  { word: "good", state: "normal", range: "0–9", advice: "Air is clean. Enjoy time outside." },
  { word: "moderate", state: "normal", range: "9–35", advice: "Fine for most people. If you have asthma or a heart condition, notice how you feel during long, hard exercise outside." },
  { word: "unhealthy for sensitive groups", state: "warn", range: "35–55", advice: "Children, older people and anyone with asthma or heart disease should cut down long or hard activity outside." },
  { word: "unhealthy", state: "critical", range: "55 and above", advice: "Everyone should reduce long or hard activity outside. Sensitive groups should stay indoors where they can." },
];

export function bandFor(pm25: number): Band {
  if (pm25 < 9) return BANDS[0]!;
  if (pm25 < 35) return BANDS[1]!;
  if (pm25 < 55) return BANDS[2]!;
  return BANDS[3]!;
}

export function partOfDay(d = new Date()): string {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Africa/Lagos" }).format(d));
  if (h < 5) return "tonight";
  if (h < 12) return "this morning";
  if (h < 17) return "this afternoon";
  if (h < 21) return "this evening";
  return "tonight";
}
