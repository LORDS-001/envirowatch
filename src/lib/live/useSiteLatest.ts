import { useMemo } from "react";
import type { Device, Measurement } from "@/lib/api/types";
import { assessQuality, type QualityAssessment } from "@/lib/quality";
import { METRIC_IDS, type MetricId } from "@/lib/metrics";
import { useLive } from "@/lib/realtime/hooks";

export interface DeviceLatest {
  deviceId: string;
  readings: Partial<Record<MetricId, { m: Measurement; q: QualityAssessment }>>;
}

/**
 * Latest live readings for a set of devices, each with its quality assessed against the
 * snapshot's flush time. Used by the map site panel, the alert drawer and device detail.
 */
export function useDevicesLatest(devices: readonly Pick<Device, "id">[]): DeviceLatest[] {
  const snapshot = useLive((s) => s);
  return useMemo(() => {
    const now = snapshot.flushedAt;
    return devices.map((d) => {
      const readings: DeviceLatest["readings"] = {};
      for (const metric of METRIC_IDS) {
        const m = snapshot.latest[`${d.id}|${metric}`];
        if (m) readings[metric] = { m, q: assessQuality(m, now) };
      }
      return { deviceId: d.id, readings };
    });
  }, [snapshot, devices]);
}
