/**
 * Mock WebSocket: streams the simulator at its real cadence (≈100 messages/s) with duplicates
 * and late deliveries injected, so the client's de-duplication and ordering are exercised.
 */
import { ws } from "msw";
import type { Measurement, WsEvent } from "@/lib/api/types";
import { config } from "@/lib/config";
import { deliveryPlan, readingFor, tickAt } from "./sim/model";
import { mockState } from "./state";

export const live = ws.link(config.wsUrl);

interface Delivery {
  at: number;
  rows: Measurement[];
}

const STEP_MS = 200;
let timer: ReturnType<typeof setInterval> | null = null;
let heartbeat: ReturnType<typeof setInterval> | null = null;
let lastT = 0;
let pending: Delivery[] = [];

function send(event: WsEvent) {
  live.broadcast(JSON.stringify(event));
}

/** Lets REST handlers push events, e.g. an alert resolving after acknowledgement. */
export function broadcastEvent(event: WsEvent) {
  if (live.clients.size > 0) send(event);
}

function step() {
  const { world, scenario } = mockState();
  const now = Date.now();
  // A backgrounded tab throttles timers; don't replay more than 30 s in one burst.
  if (now - lastT > 30_000) lastT = now - 30_000;
  // Produce every reading whose slot falls in (lastT, now].
  for (const d of world.devices) {
    const from = tickAt(d, lastT);
    const to = tickAt(d, now);
    for (let tick = from + 1; tick <= to; tick++) {
      const r = readingFor(world, scenario, d, tick);
      if (!r) continue;
      for (const at of deliveryPlan(world, scenario, r)) pending.push({ at, rows: r.rows });
      // The backend's detectors flag spikes as they arrive (sensor.fault_detected).
      if (r.faults.includes("spike")) {
        send({
          type: "sensor.fault_detected",
          data: { device_id: d.id, fault_type: "spike", severity: "warn", detected_at: new Date(r.emitAt + 2000).toISOString() },
        });
      }
    }
  }
  lastT = now;

  const due: Delivery[] = [];
  const later: Delivery[] = [];
  for (const p of pending) (p.at <= now ? due : later).push(p);
  pending = later;
  if (due.length === 0) return;
  // Delivery order, not event order: late readings really do arrive out of order.
  due.sort((a, b) => a.at - b.at);
  for (const p of due) {
    const received_at = new Date(p.at).toISOString();
    send({ type: "measurement.updated", data: p.rows.map((r) => ({ ...r, received_at })) });
  }
}

function start() {
  if (timer) return;
  lastT = Date.now();
  timer = setInterval(step, STEP_MS);
  heartbeat = setInterval(() => send({ type: "heartbeat", data: { server_time: new Date().toISOString() } }), 5000);
}

function stopIfIdle() {
  if (live.clients.size > 0) return;
  if (timer) clearInterval(timer);
  if (heartbeat) clearInterval(heartbeat);
  timer = heartbeat = null;
  pending = [];
}

export const liveHandler = live.addEventListener("connection", ({ client }) => {
  start();
  // Faults already open when this client connects.
  const { scenario, world } = mockState();
  const silent = world.devices[scenario.silentDevice];
  if (silent) {
    // After the socket has opened on the client side.
    setTimeout(() => client.send(
      JSON.stringify({
        type: "sensor.fault_detected",
        data: { device_id: silent.id, fault_type: "silent", severity: "critical", detected_at: new Date(scenario.silentSince + 60_000).toISOString() },
      } satisfies WsEvent),
    ), 250);
  }
  client.addEventListener("close", () => setTimeout(stopIfIdle, 0));
});
