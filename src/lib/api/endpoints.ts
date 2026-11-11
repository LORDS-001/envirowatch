/** Typed endpoints. One function per route in the PRD contract (§9), plus logged gap endpoints. */
import { z } from "zod";
import type { MetricId } from "@/lib/metrics";
import { request } from "./client";
import * as S from "./schemas";

export const api = {
  login: (email: string, password: string) =>
    request("/auth/login", {
      method: "POST",
      body: { email, password },
      schema: S.LoginResponseSchema,
      anonymous: true,
    }),

  /** GAP: refresh via httpOnly cookie. Returns 401 when there's no session. */
  refresh: () => request("/auth/refresh", { method: "POST", schema: S.LoginResponseSchema, anonymous: true }),

  /** GAP: server-side logout to clear the refresh cookie. */
  logout: () => request("/auth/logout", { method: "POST", schema: z.null(), anonymous: true }),

  devices: (signal?: AbortSignal) => request("/devices", { schema: page(S.DeviceSchema), signal }),

  /** GAP: sites endpoint. */
  sites: (signal?: AbortSignal) => request("/sites", { schema: page(S.SiteSchema), signal }),

  aggregates: (
    q: { metric: MetricId; from: string; to: string; bucket: "1h" | "1d"; group_by?: "all" | "device" },
    signal?: AbortSignal,
  ) => request("/measurements/aggregates", { schema: page(S.AggregateSchema), query: q, signal }),

  heatmap: (metric: MetricId, signal?: AbortSignal) =>
    request("/heatmap", { schema: S.HeatmapSchema, query: { metric }, signal }),

  alerts: (q: { status?: readonly string[] } = {}, signal?: AbortSignal) =>
    request("/alerts", { schema: page(S.AlertSchema), query: q, signal }),

  acknowledgeAlert: (id: string) =>
    request(`/alerts/${encodeURIComponent(id)}/acknowledge`, { method: "POST", schema: S.AlertSchema }),

  systemHealth: (signal?: AbortSignal) => request("/system/health", { schema: S.SystemHealthSchema, signal }),

  /** GAP: daily quality breakdown. */
  qualitySummary: (days: number, signal?: AbortSignal) =>
    request("/measurements/quality-summary", { schema: S.QualitySummarySchema, query: { days }, signal }),

  publicSummary: (signal?: AbortSignal) =>
    request("/public/summary", { schema: S.PublicSummarySchema, signal, anonymous: true }),
};

function page<T extends z.ZodType>(item: T) {
  return S.page(item);
}
