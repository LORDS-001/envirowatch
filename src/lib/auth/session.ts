/**
 * Session. The access token lives in memory only; never localStorage. On reload the app asks
 * the backend to refresh from its httpOnly cookie (GAP: /auth/refresh); if that fails, the person
 * signs in again.
 */
import { create } from "zustand";
import { api } from "@/lib/api/endpoints";
import { configureApiClient } from "@/lib/api/client";
import type { Organization, Role, User } from "@/lib/api/types";
import { clearSessionData } from "./lifecycle";

type Status = "unknown" | "authenticated" | "anonymous";

interface SessionState {
  status: Status;
  token: string | null;
  user: User | null;
  organization: Organization | null;
  signIn: (email: string, password: string) => Promise<void>;
  restore: () => Promise<void>;
  signOut: () => Promise<void>;
  /** Called by the API client on 401. */
  expire: () => void;
}

let restoration: Promise<void> | null = null;
let generation = 0;
let signingOut: Promise<unknown> | null = null;

export const useSession = create<SessionState>((set) => ({
  status: "unknown",
  token: null,
  user: null,
  organization: null,
  async signIn(email, password) {
    if (signingOut) await signingOut.catch(() => {});
    if (restoration) await restoration;
    const res = await api.login(email, password);
    generation++;
    clearSessionData();
    set({ status: "authenticated", token: res.access_token, user: res.user, organization: res.organization });
  },
  restore() {
    if (restoration) return restoration;
    const current = generation;
    restoration = (async () => {
      try {
        const res = await api.refresh();
        if (current === generation)
          set({
            status: "authenticated",
            token: res.access_token,
            user: res.user,
            organization: res.organization,
          });
      } catch {
        if (current === generation) useSession.getState().expire();
      }
    })().finally(() => {
      restoration = null;
    });
    return restoration;
  },
  async signOut() {
    generation++;
    clearSessionData();
    set({ status: "anonymous", token: null, user: null, organization: null });
    signingOut = (async () => {
      if (restoration) await restoration;
      await api.logout();
    })();
    try {
      await signingOut;
    } finally {
      signingOut = null;
    }
  },
  expire() {
    generation++;
    clearSessionData();
    set({ status: "anonymous", token: null, user: null, organization: null });
  },
}));

configureApiClient({
  getToken: () => useSession.getState().token,
  onUnauthorized: () => useSession.getState().expire(),
  refreshSession: async () => {
    await useSession.getState().restore();
    return useSession.getState().status === "authenticated";
  },
});

export function hasRole(user: User | null, role: Role): boolean {
  if (!user) return false;
  return role === "operator" ? true : user.role === "admin";
}
