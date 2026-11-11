/**
 * Session. The access token lives in memory only; never localStorage. On reload the app asks
 * the backend to refresh from its httpOnly cookie (GAP: /auth/refresh); if that fails, the person
 * signs in again.
 */
import { create } from "zustand";
import { api } from "@/lib/api/endpoints";
import { configureApiClient } from "@/lib/api/client";
import type { Organization, Role, User } from "@/lib/api/types";

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

export const useSession = create<SessionState>((set) => ({
  status: "unknown",
  token: null,
  user: null,
  organization: null,
  async signIn(email, password) {
    const res = await api.login(email, password);
    set({ status: "authenticated", token: res.access_token, user: res.user, organization: res.organization });
  },
  async restore() {
    try {
      const res = await api.refresh();
      set({ status: "authenticated", token: res.access_token, user: res.user, organization: res.organization });
    } catch {
      set({ status: "anonymous", token: null, user: null, organization: null });
    }
  },
  async signOut() {
    try {
      await api.logout();
    } finally {
      set({ status: "anonymous", token: null, user: null, organization: null });
    }
  },
  expire() {
    set({ status: "anonymous", token: null, user: null, organization: null });
  },
}));

configureApiClient({
  getToken: () => useSession.getState().token,
  onUnauthorized: () => useSession.getState().expire(),
});

export function hasRole(user: User | null, role: Role): boolean {
  if (!user) return false;
  return role === "operator" ? true : user.role === "admin";
}
