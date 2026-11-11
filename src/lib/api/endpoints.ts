/** Typed endpoints. One function per route in the PRD contract (§9), plus logged gap endpoints. */
import { z } from "zod";
import type { MetricId } from "@/lib/metrics";
import { request, requestBlob } from "./client";
import * as S from "./schemas";
import type { AlertRule, Channel, Retention, Role, SimFault } from "./types";

export type Bucket = "1m" | "15m" | "1h" | "6h" | "1d";

export interface AggregateQuery {
  metric: MetricId;
  from: string;
  to: string;
  bucket: Bucket;
  /** GAP: `all` (city), `site` (needs site_id) or `device` (needs device_id). */
  group_by?: "all" | "site" | "device";
  site_id?: string;
  device_id?: string;
}

export interface RegisterDeviceBody {
  id: string;
  type: string;
  site_id: string;
  latitude: number;
  longitude: number;
  metrics: MetricId[];
}

export interface ExportQuery {
  format: "csv" | "pdf";
  site_ids: readonly string[];
  metrics: readonly MetricId[];
  from: string;
  to: string;
  quality_notes: boolean;
}

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

  // ---- Devices ----

  devices: (q: { organization_id?: string } = {}, signal?: AbortSignal) =>
    request("/devices", { schema: page(S.DeviceSchema), query: q, signal }),

  /** GAP: single device. */
  device: (id: string, signal?: AbortSignal) => request(`/devices/${enc(id)}`, { schema: S.DeviceSchema, signal }),

  registerDevice: (body: RegisterDeviceBody) =>
    request("/devices", { method: "POST", body, schema: S.DeviceWithKeySchema }),

  updateDevice: (id: string, patch: Partial<Pick<RegisterDeviceBody, "type" | "site_id">> & { status?: "active" | "deactivated" }) =>
    request(`/devices/${enc(id)}`, { method: "PATCH", body: patch, schema: S.DeviceSchema }),

  rotateKey: (id: string) => request(`/devices/${enc(id)}/rotate-key`, { method: "POST", schema: S.RotatedKeySchema }),

  deviceHealth: (id: string, signal?: AbortSignal) =>
    request(`/devices/${enc(id)}/health`, { schema: S.DeviceHealthSchema, signal }),

  /** GAP: ingestion outcomes for one device. */
  ingestionEvents: (id: string, signal?: AbortSignal) =>
    request(`/devices/${enc(id)}/ingestion-events`, { schema: page(S.IngestionEventSchema), signal }),

  /** GAP: health of every device, for the health page. */
  healthSummary: (signal?: AbortSignal) =>
    request("/health/devices", { schema: page(S.HealthSummaryItemSchema), signal }),

  // ---- Sites and measurements ----

  /** GAP: sites endpoint. */
  sites: (signal?: AbortSignal) => request("/sites", { schema: page(S.SiteSchema), signal }),

  createSite: (body: { name: string; latitude: number; longitude: number }) =>
    request("/sites", { method: "POST", body, schema: S.SiteSchema }),

  /** Raw readings for one device and metric. GAP: cursor pagination; ranges up to 24 h. */
  measurements: (
    q: { device_id: string; metric: MetricId; from: string; to: string; cursor?: string | null; limit?: number },
    signal?: AbortSignal,
  ) => request("/measurements", { schema: page(S.MeasurementSchema), query: q, signal }),

  aggregates: (q: AggregateQuery, signal?: AbortSignal) =>
    request("/measurements/aggregates", { schema: page(S.AggregateSchema), query: { ...q }, signal }),

  /** GAP: `at` for a past moment, `include_suspicious` for investigators. */
  heatmap: (metric: MetricId, opts: { at?: string; includeSuspicious?: boolean } = {}, signal?: AbortSignal) =>
    request("/heatmap", {
      schema: S.HeatmapSchema,
      query: { metric, at: opts.at, include_suspicious: opts.includeSuspicious || undefined },
      signal,
    }),

  /** GAP: daily quality breakdown. */
  qualitySummary: (days: number, signal?: AbortSignal) =>
    request("/measurements/quality-summary", { schema: S.QualitySummarySchema, query: { days }, signal }),

  // ---- Alerts ----

  alerts: (q: { status?: readonly string[] } = {}, signal?: AbortSignal) =>
    request("/alerts", { schema: page(S.AlertSchema), query: q, signal }),

  /** GAP: single alert. */
  alert: (id: string, signal?: AbortSignal) => request(`/alerts/${enc(id)}`, { schema: S.AlertSchema, signal }),

  acknowledgeAlert: (id: string) => request(`/alerts/${enc(id)}/acknowledge`, { method: "POST", schema: S.AlertSchema }),

  // ---- System, reports ----

  systemHealth: (signal?: AbortSignal) => request("/system/health", { schema: S.SystemHealthSchema, signal }),

  exportReport: (q: ExportQuery, signal?: AbortSignal) =>
    requestBlob("/reports/export", { query: { ...q, quality_notes: q.quality_notes }, signal }),

  // ---- Admin (GAP) ----

  updateOrganization: (name: string) =>
    request("/organization", { method: "PATCH", body: { name }, schema: S.OrganizationSchema }),

  users: (signal?: AbortSignal) => request("/users", { schema: page(S.UserSchema), signal }),

  inviteUser: (email: string, role: Role) =>
    request("/users", { method: "POST", body: { email, role }, schema: S.UserSchema }),

  updateUser: (id: string, role: Role) =>
    request(`/users/${enc(id)}`, { method: "PATCH", body: { role }, schema: S.UserSchema }),

  alertRules: (signal?: AbortSignal) => request("/alert-rules", { schema: page(S.AlertRuleSchema), signal }),

  updateAlertRule: (id: string, patch: Partial<Omit<AlertRule, "id">> & { channels?: Channel[] }) =>
    request(`/alert-rules/${enc(id)}`, { method: "PATCH", body: patch, schema: S.AlertRuleSchema }),

  retention: (signal?: AbortSignal) => request("/retention", { schema: S.RetentionSchema, signal }),

  updateRetention: (body: Retention) => request("/retention", { method: "PUT", body, schema: S.RetentionSchema }),

  simulatorStatus: (signal?: AbortSignal) => request("/simulator/run", { schema: S.SimStatusSchema, signal }),

  startSimulation: (body: { scenario: "baseline" | "fault_hour" | "custom"; seed: number; faults: SimFault[]; speed: number }) =>
    request("/simulator/run", { method: "POST", body, schema: S.SimStatusSchema }),

  controlSimulation: (action: "pause" | "resume" | "stop") =>
    request(`/simulator/run/${action}`, { method: "POST", schema: S.SimStatusSchema }),

  // ---- Public (no auth) ----

  publicSummary: (signal?: AbortSignal) =>
    request("/public/summary", { schema: S.PublicSummarySchema, signal, anonymous: true }),

  /** GAP: 24 h city trend for the public page. */
  publicTrend: (metric: MetricId, signal?: AbortSignal) =>
    request("/public/trend", { schema: S.PublicTrendSchema, query: { metric, hours: 24 }, signal, anonymous: true }),

  /** GAP: public heat map input (approved data only). */
  publicHeatmap: (metric: MetricId, signal?: AbortSignal) =>
    request("/public/heatmap", { schema: S.HeatmapSchema, query: { metric }, signal, anonymous: true }),

  /** GAP: permitted public CSV export. */
  publicExport: () => requestBlob("/public/export.csv", { anonymous: true }),
};

function page<T extends z.ZodType>(item: T) {
  return S.page(item);
}

function enc(id: string) {
  return encodeURIComponent(id);
}
