/**
 * Zod schemas for every API response and WebSocket message. Data is parsed at the boundary;
 * nothing unparsed reaches a component.
 *
 * Fields marked `GAP` are not in the PRD data model. Each has an entry in docs/API_GAPS.md.
 */
import { z } from "zod";

const isoDate = z.string().refine((s) => !Number.isNaN(Date.parse(s)), "Expected an ISO 8601 timestamp");

export const RoleSchema = z.enum(["admin", "operator"]);

export const OrganizationSchema = z.object({ id: z.string(), name: z.string() });

export const UserSchema = z.object({
  id: z.string(),
  organization_id: z.string(),
  email: z.string(),
  role: RoleSchema,
});

/** GAP: login response shape. */
export const LoginResponseSchema = z.object({
  access_token: z.string(),
  user: UserSchema,
  organization: OrganizationSchema,
});

export const SiteSchema = z.object({
  id: z.string(),
  organization_id: z.string(),
  name: z.string(),
  latitude: z.number(),
  longitude: z.number(),
});

export const MetricIdSchema = z.enum(["pm25", "temperature_c", "humidity_percent"]);

export const DeviceSchema = z.object({
  id: z.string(),
  site_id: z.string(),
  type: z.string(),
  status: z.enum(["active", "deactivated"]),
  last_seen_at: isoDate.nullable(),
  /** GAP: FR-001 supported metrics; not in the data model table. */
  metrics: z.array(MetricIdSchema).optional(),
});

export const QualityStatusSchema = z.enum(["valid", "suspicious", "quarantined", "estimated"]);

export const MeasurementSchema = z.object({
  device_id: z.string(),
  reading_id: z.string(),
  metric: MetricIdSchema,
  value: z.number(),
  unit: z.string(),
  event_time: isoDate,
  received_at: isoDate,
  quality_status: QualityStatusSchema,
  /** GAP: short human-readable reason for suspicious/quarantined (e.g. "spike +340 %"). */
  quality_reason: z.string().nullable().optional(),
});

export const AggregateSchema = z.object({
  /** Null when aggregated across all devices (GAP: `group_by=all`). */
  device_id: z.string().nullable(),
  metric: MetricIdSchema,
  bucket_start: isoDate,
  min: z.number(),
  max: z.number(),
  avg: z.number(),
  count: z.number().int(),
});

/** GAP: /heatmap returns IDW input (per-site samples); the client interpolates. */
export const HeatmapSampleSchema = z.object({
  site_id: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  value: z.number(),
  quality_status: QualityStatusSchema,
  event_time: isoDate,
  received_at: isoDate,
  device_count: z.number().int(),
});

export const HeatmapSchema = z.object({
  metric: MetricIdSchema,
  unit: z.string(),
  generated_at: isoDate,
  samples: z.array(HeatmapSampleSchema),
});

export const NotificationAttemptSchema = z.object({
  alert_id: z.string(),
  channel: z.enum(["email", "sms", "webhook"]),
  outcome: z.enum(["delivered", "failed", "pending"]),
  attempted_at: isoDate,
});

export const AlertStatusSchema = z.enum(["pending", "active", "acknowledged", "resolved"]);

export const AlertSchema = z.object({
  id: z.string(),
  /** GAP: environment hazards and device-health alerts must be told apart (PRD §13). */
  kind: z.enum(["environment", "device"]),
  metric: MetricIdSchema.nullable(),
  site_id: z.string().nullable(),
  device_id: z.string().nullable(),
  title: z.string(),
  status: AlertStatusSchema,
  threshold: z.number().nullable(),
  hysteresis: z.number().nullable(),
  value: z.number().nullable(),
  opened_at: isoDate,
  activated_at: isoDate.nullable(),
  acknowledged_at: isoDate.nullable(),
  resolved_at: isoDate.nullable(),
  /** GAP: number of nearby sensors agreeing, for corroboration. */
  corroborating_devices: z.number().int().nullable().optional(),
  notifications: z.array(NotificationAttemptSchema).default([]),
});

export const SystemHealthSchema = z.object({
  status: z.enum(["ok", "degraded", "down"]),
  generated_at: isoDate,
  queue_depth: z.number(),
  ingest_rate_per_s: z.number(),
  latency_ms: z.object({ p50: z.number(), p95: z.number(), p99: z.number() }),
  error_rate: z.number(),
  db_writes_per_s: z.number(),
  /** GAP: share of readings in the last 24 h stored as valid. */
  valid_rate_24h: z.number().optional(),
});

/** GAP: daily quality breakdown for QualityBlocks. */
export const QualityDaySchema = z.object({
  date: isoDate,
  valid: z.number().int(),
  estimated: z.number().int(),
  suspicious: z.number().int(),
  missing: z.number().int(),
});
export const QualitySummarySchema = z.object({ days: z.array(QualityDaySchema) });

export const PublicAreaSchema = z.object({
  site_id: z.string(),
  name: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  readings: z.array(
    z.object({ metric: MetricIdSchema, value: z.number(), event_time: isoDate, quality_status: QualityStatusSchema }),
  ),
});

export const PublicSummarySchema = z.object({
  generated_at: isoDate,
  areas: z.array(PublicAreaSchema),
});

// ---- Device health, ingestion and credentials ----

export const DeviceHealthStatusSchema = z.enum(["online", "silent", "drifting", "suspicious", "deactivated"]);
export const FaultTypeSchema = z.enum(["silent", "drift", "spike", "clock_error", "duplicate", "late", "network"]);

export const DeviceHealthEventSchema = z.object({
  device_id: z.string(),
  fault_type: FaultTypeSchema,
  severity: z.enum(["warn", "critical"]),
  detected_at: isoDate,
  /** GAP: human-readable detail, e.g. "+4.2 µg/m³ against neighbours over 6 h". */
  detail: z.string().nullable().optional(),
});

export const DeviceHealthSchema = z.object({
  device_id: z.string(),
  health: DeviceHealthStatusSchema,
  last_seen_at: isoDate.nullable(),
  events: z.array(DeviceHealthEventSchema),
});

/** GAP: GET /health/devices, one row per device for the health page. */
export const HealthSummaryItemSchema = z.object({
  device_id: z.string(),
  site_id: z.string(),
  health: DeviceHealthStatusSchema,
  last_seen_at: isoDate.nullable(),
  latest_event: DeviceHealthEventSchema.nullable(),
});

/** GAP: GET /devices/{id}/ingestion-events (the ingestion_events table). */
export const IngestionEventSchema = z.object({
  device_id: z.string(),
  reading_id: z.string(),
  outcome: z.enum(["accepted", "duplicate", "late", "quarantined", "rejected"]),
  reason: z.string().nullable(),
  received_at: isoDate,
});

/** POST /devices: the key is returned once, never again. */
export const DeviceWithKeySchema = z.object({ device: DeviceSchema, api_key: z.string() });
export const RotatedKeySchema = z.object({ device_id: z.string(), api_key: z.string(), rotated_at: isoDate });

// ---- Admin resources (GAP) ----

export const ChannelSchema = z.enum(["email", "sms", "webhook"]);

export const AlertRuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  metric: MetricIdSchema,
  kind: z.enum(["threshold", "unusual_change"]),
  /** Threshold value, or for unusual change the % jump that triggers. */
  threshold: z.number(),
  hysteresis: z.number(),
  consecutive_readings: z.number().int(),
  cooldown_min: z.number().int(),
  channels: z.array(ChannelSchema),
  enabled: z.boolean(),
});

export const RetentionSchema = z.object({
  raw_days: z.number().int(),
  hourly_days: z.number().int(),
  daily_days: z.number().int(),
  ingestion_events_days: z.number().int(),
});

// ---- Simulator (GAP) ----

export const SimFaultSchema = z.enum(["duplicate", "late", "silent", "clock_error", "spike", "drift", "network"]);

export const SimEventSchema = z.object({
  id: z.string(),
  fault_type: SimFaultSchema,
  device_id: z.string(),
  /** Simulated seconds since the run started. */
  injected_s: z.number(),
  detected_s: z.number().nullable(),
  outcome: z.enum(["detected", "missed", "pending"]),
});

export const SimFalseAlertSchema = z.object({
  id: z.string(),
  device_id: z.string(),
  fault_type: SimFaultSchema,
  detected_s: z.number(),
});

export const SimRunSchema = z.object({
  id: z.string(),
  scenario: z.enum(["baseline", "fault_hour", "custom"]),
  seed: z.number().int(),
  faults: z.array(SimFaultSchema),
  speed: z.number(),
  status: z.enum(["running", "paused", "stopped", "completed"]),
  started_at: isoDate,
  elapsed_s: z.number(),
  duration_s: z.number(),
  events: z.array(SimEventSchema),
  false_alerts: z.array(SimFalseAlertSchema),
});

export const SimStatusSchema = z.object({ run: SimRunSchema.nullable() });

// ---- Public (GAP) ----

export const PublicTrendSchema = z.object({
  metric: MetricIdSchema,
  unit: z.string(),
  points: z.array(z.object({ bucket_start: isoDate, avg: z.number() })),
});

/** GAP: cursor pagination envelope. */
export const page = <T extends z.ZodType>(item: T) =>
  z.object({ items: z.array(item), next_cursor: z.string().nullable() });

// ---- WebSocket events (PRD §9). GAP: envelope `{ type, data }`. ----

export const WsEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("measurement.updated"), data: z.array(MeasurementSchema) }),
  z.object({
    type: z.literal("device.status_changed"),
    data: z.object({ device_id: z.string(), status: z.string(), last_seen_at: isoDate.nullable() }),
  }),
  z.object({ type: z.literal("alert.created"), data: AlertSchema }),
  z.object({ type: z.literal("alert.resolved"), data: AlertSchema }),
  z.object({
    type: z.literal("sensor.fault_detected"),
    data: z.object({
      device_id: z.string(),
      fault_type: z.enum(["silent", "drift", "spike", "clock_error", "duplicate", "late"]),
      severity: z.enum(["warn", "critical"]),
      detected_at: isoDate,
    }),
  }),
  z.object({ type: z.literal("heartbeat"), data: z.object({ server_time: isoDate }) }),
]);
