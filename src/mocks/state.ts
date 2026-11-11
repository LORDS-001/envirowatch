/**
 * The mock backend's state: one seeded world, the active fault scenario, alerts and sessions.
 * It stands in for the server, so it may keep its own storage; app code never reads it.
 */
import type { Alert, NotificationAttempt } from "@/lib/api/types";
import { config } from "@/lib/config";
import { baselineScenario, type Scenario } from "./sim/model";
import { createWorld, ORG, type World } from "./sim/world";

export const MOCK_PASSWORD = "envirowatch-demo";
export const MOCK_USERS = {
  "admin@envirowatch.test": { id: "user-admin", role: "admin" as const },
  "operator@envirowatch.test": { id: "user-operator", role: "operator" as const },
};
export type MockEmail = keyof typeof MOCK_USERS;

const MIN = 60_000;

export interface MockState {
  world: World;
  scenario: Scenario;
  alerts: Alert[];
}

let state: MockState | null = null;

export function mockState(): MockState {
  if (!state) {
    const t0 = Date.now();
    const world = createWorld(config.simSeed);
    const scenario = baselineScenario(t0);
    state = { world, scenario, alerts: seedAlerts(t0) };
  }
  return state;
}

function iso(t: number) {
  return new Date(t).toISOString();
}

function notifications(alertId: string, at: number, outcomes: Array<[NotificationAttempt["channel"], NotificationAttempt["outcome"]]>) {
  return outcomes.map(([channel, outcome], i) => ({ alert_id: alertId, channel, outcome, attempted_at: iso(at + i * 1500) }));
}

function seedAlerts(t0: number): Alert[] {
  const base = {
    hysteresis: null,
    acknowledged_at: null,
    resolved_at: null,
    corroborating_devices: null,
    notifications: [],
    threshold: null,
    value: null,
    metric: null,
    site_id: null,
    device_id: null,
  };
  return [
    {
      ...base,
      id: "alert-1042",
      kind: "environment",
      metric: "pm25",
      site_id: "site-apapa-port",
      title: "PM2.5 above 35 µg/m³ for 10 min · Apapa Port",
      status: "active",
      threshold: 35,
      hysteresis: 5,
      value: 41.8,
      corroborating_devices: 18,
      opened_at: iso(t0 - 14 * MIN),
      activated_at: iso(t0 - 10 * MIN),
      notifications: notifications("alert-1042", t0 - 10 * MIN, [
        ["email", "delivered"],
        ["sms", "delivered"],
        ["webhook", "failed"],
      ]),
    },
    {
      ...base,
      id: "alert-1043",
      kind: "device",
      device_id: "sensor-014",
      site_id: "site-surulere",
      title: "Sensor 014 · silent for 6 min",
      status: "active",
      opened_at: iso(t0 - 5 * MIN),
      activated_at: iso(t0 - 5 * MIN),
      notifications: notifications("alert-1043", t0 - 5 * MIN, [["email", "delivered"]]),
    },
    {
      ...base,
      id: "alert-1044",
      kind: "environment",
      metric: "pm25",
      site_id: "site-oshodi",
      title: "PM2.5 above 35 µg/m³ for 3 min · Oshodi",
      status: "pending",
      threshold: 35,
      hysteresis: 5,
      value: 36.4,
      corroborating_devices: 9,
      opened_at: iso(t0 - 3 * MIN),
      activated_at: null,
    },
    {
      ...base,
      id: "alert-1039",
      kind: "device",
      device_id: "sensor-512",
      site_id: "site-iganmu",
      title: "Sensor 512 · 4 suspicious spikes in 20 min",
      status: "acknowledged",
      opened_at: iso(t0 - 42 * MIN),
      activated_at: iso(t0 - 40 * MIN),
      acknowledged_at: iso(t0 - 31 * MIN),
      notifications: notifications("alert-1039", t0 - 40 * MIN, [["email", "delivered"]]),
    },
    {
      ...base,
      id: "alert-1037",
      kind: "device",
      device_id: "sensor-207",
      site_id: "site-oniru",
      title: "Sensor 207 · possible drift, +4.2 µg/m³ against neighbours over 6 h",
      status: "pending",
      opened_at: iso(t0 - 55 * MIN),
      activated_at: null,
    },
    {
      ...base,
      id: "alert-1031",
      kind: "environment",
      metric: "pm25",
      site_id: "site-ijora",
      title: "PM2.5 above 35 µg/m³ for 25 min · Ijora",
      status: "resolved",
      threshold: 35,
      hysteresis: 5,
      value: 38.9,
      corroborating_devices: 21,
      opened_at: iso(t0 - 190 * MIN),
      activated_at: iso(t0 - 186 * MIN),
      acknowledged_at: iso(t0 - 180 * MIN),
      resolved_at: iso(t0 - 161 * MIN),
      notifications: notifications("alert-1031", t0 - 186 * MIN, [
        ["email", "delivered"],
        ["sms", "delivered"],
      ]),
    },
  ];
}

// ---- Sessions (the "server side" of the httpOnly refresh cookie) ----

const SESSION_KEY = "envirowatch-mock-server-session";

export function mockSessionUser(): MockEmail | null {
  try {
    const v = sessionStorage.getItem(SESSION_KEY);
    return v && v in MOCK_USERS ? (v as MockEmail) : null;
  } catch {
    return null;
  }
}

export function setMockSessionUser(email: MockEmail | null) {
  try {
    if (email) sessionStorage.setItem(SESSION_KEY, email);
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // Storage unavailable: sessions just won't survive reloads.
  }
}

export const mockOrg = ORG;
