import { create } from "zustand";

export type ConnectionStatus = "idle" | "connecting" | "connected" | "reconnecting" | "offline";

interface ConnectionState {
  status: ConnectionStatus;
  /** ms since the newest event_time; null before the first event. */
  lagMs: number | null;
  set: (patch: Partial<Pick<ConnectionState, "status" | "lagMs">>) => void;
}

export const useConnection = create<ConnectionState>((set) => ({
  status: "idle",
  lagMs: null,
  set: (patch) => set(patch),
}));
