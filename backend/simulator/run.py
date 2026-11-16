"""EnviroWatch sensor simulator  Usage: python -m simulator.run --help"""
import time
import argparse
import asyncio
import json
import math
import random
from collections import Counter
from datetime import datetime, timedelta, timezone

import httpx

METRICS = ["pm25", "temperature_c", "humidity_percent"]


def iso(dt: datetime) -> str:
    return dt.replace(microsecond=0).astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def clamp(x: float, low: float, high: float) -> float:
    return max(low, min(high, x))


def environment(seed: int, device_id: str, tick: int, now: datetime) -> dict[str, float]:
    h = now.hour + now.minute / 60
    daily = math.sin(2 * math.pi * (h - 9) / 24)
    phase = random.Random(seed).uniform(0, 2 * math.pi)
    episode = 8 * math.sin(2 * math.pi * now.timestamp() / (6 * 3600) + phase)  # shared by all devices

    off = random.Random(f"{seed}:{device_id}:site")
    pm_off, t_off = off.uniform(-6, 6), off.uniform(-1, 1)
    rng = random.Random(f"{seed}:{device_id}:{tick}")

    rush = 12 * math.exp(-((h - 7) ** 2) / 4) + 14 * math.exp(-((h - 18) ** 2) / 4)
    return {
        "pm25": clamp(25 + rush + episode + pm_off + rng.gauss(0, 2), 1, 900),
        "temperature_c": 28 + 4 * daily + t_off + rng.gauss(0, 0.3),
        "humidity_percent": clamp(72 - 14 * daily + rng.gauss(0, 1.5), 20, 100),
    }


async def register_devices(client: httpx.AsyncClient, base: str, args) -> list[dict]:
    r = await client.post(f"{base}/auth/login", json={"email": args.email, "password": args.password})
    r.raise_for_status()
    auth = {"Authorization": f"Bearer {r.json()['access_token']}"}

    r = await client.get(f"{base}/sites", params={"limit": 500}, headers=auth)
    r.raise_for_status()
    sites = r.json()["items"]

    devices = []
    for i in range(1, args.devices + 1):
        dev_id = f"sim-{i:04d}"
        body = {
            "id": dev_id,
            "site_id": sites[(i - 1) % len(sites)]["id"],
            "type": "air-quality",
            "metrics": METRICS,
        }
        r = await client.post(f"{base}/devices", json=body, headers=auth)
        if r.status_code == 409:  # already registered: reactivate and rotate to get a usable key
            await client.patch(f"{base}/devices/{dev_id}", json={"status": "active"}, headers=auth)
            r = await client.post(f"{base}/devices/{dev_id}/rotate-key", headers=auth)
        r.raise_for_status()
        devices.append({"id": dev_id, "key": r.json()["api_key"], "role": "normal"})

    if args.faults and len(devices) >= 3:
        silent, drifting = random.Random(args.seed).sample(range(len(devices)), 2)
        devices[silent]["role"] = "silent"
        devices[drifting]["role"] = "drift"
    return devices


class Simulator:
    def __init__(self, client, base, args, truth_file):
        self.client, self.base, self.args, self.truth_file = client, base, args, truth_file
        self.stats: Counter = Counter()
        self.latencies: list[float] = []
        self.faults_logged: set[tuple[str, str]] = set()

    def truth(self, fault: str, device_id: str, reading_id: str | None, at: datetime) -> None:
        self.truth_file.write(
            json.dumps(
                {"fault_type": fault, "device_id": device_id, "reading_id": reading_id, "injected_at": iso(at)}
            )
            + "\n"
        )
        self.truth_file.flush()

    async def post(self, dev: dict, payload: dict) -> None:
        start = time.perf_counter()
        try:
            r = await self.client.post(
                f"{self.base}/ingest", json=payload, headers={"X-API-Key": dev["key"]}
            )
        except httpx.HTTPError:
            self.stats["network_error"] += 1
            return
        self.latencies.append(time.perf_counter() - start)
        if r.status_code in (200, 202):
            self.stats[r.json().get("status", "?")] += 1
        else:
            self.stats[f"http_{r.status_code}"] += 1

    async def send_device(self, dev: dict, tick: int, now: datetime) -> None:
        a = self.args

        if dev["role"] == "silent" and tick > a.silent_after:
            if ("silent", dev["id"]) not in self.faults_logged:
                self.faults_logged.add(("silent", dev["id"]))
                self.truth("silent", dev["id"], None, now)
            return

        values = environment(a.seed, dev["id"], tick, now)
        if dev["role"] == "drift":
            values["temperature_c"] += 0.05 * tick  # bias grows every tick
            if ("drift", dev["id"]) not in self.faults_logged:
                self.faults_logged.add(("drift", dev["id"]))
                self.truth("drift", dev["id"], None, now)

        reading_id = f"{dev['id']}-{a.run_id}-{tick:07d}" 
        event_time = now 
        fault = None

        if a.faults:
            r = random.Random(f"{a.seed}:{dev['id']}:{tick}:fault").random()
            acc = 0.0
            for name, rate in (
                ("clock_error", a.clock_rate),
                ("spike", a.spike_rate),
                ("late", a.late_rate),
                ("duplicate", a.dup_rate),
            ):
                acc += rate
                if r < acc:
                    fault = name
                    break

        if fault == "clock_error":
            event_time = now + timedelta(hours=1)
        elif fault == "late":
            event_time = now - timedelta(minutes=random.Random(f"{reading_id}:late").uniform(6, 15))
        elif fault == "spike":
            values["pm25"] += 300

        payload = {
            "reading_id": reading_id,
            "device_id": dev["id"],
            "timestamp": iso(event_time),
            "measurements": {k: round(v, 2) for k, v in values.items()},
        }
        if fault:
            self.truth(fault, dev["id"], reading_id, now)

        await self.post(dev, payload)
        if fault == "duplicate":
            await self.post(dev, payload)  # identical resend


def parse_args():
    p = argparse.ArgumentParser(description="EnviroWatch sensor simulator")
    p.add_argument("--base", default="http://localhost:8000/api/v1")
    p.add_argument("--email", default="admin@envirowatch.test")
    p.add_argument("--password", default="envirowatch-demo")
    p.add_argument("--devices", type=int, default=20)
    p.add_argument("--interval", type=float, default=10, help="seconds between readings per device")
    p.add_argument("--minutes", type=float, default=3)
    p.add_argument("--seed", type=int, default=4242)
    p.add_argument("--faults", action="store_true", help="inject faults")
    p.add_argument("--dup-rate", type=float, default=0.02)
    p.add_argument("--late-rate", type=float, default=0.02)
    p.add_argument("--spike-rate", type=float, default=0.01)
    p.add_argument("--clock-rate", type=float, default=0.01)
    p.add_argument("--silent-after", type=int, default=10, help="tick after which the silent device stops")
    p.add_argument("--truth-file", default="ground_truth.jsonl")
    p.add_argument("--run-id", default=datetime.now(timezone.utc).strftime("%y%m%d%H%M%S"),
                   help="included in reading IDs so separate runs never collide")
    return p.parse_args()


def report(sim: "Simulator") -> None:
    lat = sorted(sim.latencies)
    if not lat:
        return
    pick = lambda q: lat[min(len(lat) - 1, int(q * len(lat)))] * 1000
    print(f"requests={len(lat)}  p50={pick(.5):.0f} ms  p95={pick(.95):.0f} ms  p99={pick(.99):.0f} ms")

async def main() -> None:
    args = parse_args()
    base = args.base.rstrip("/")
    async with httpx.AsyncClient(timeout=10, limits=httpx.Limits(max_connections=100)) as client:
        devices = await register_devices(client, base, args)
        print(f"Registered {len(devices)} devices. Roles: "
              f"{ {d['id']: d['role'] for d in devices if d['role'] != 'normal'} }")

        total_ticks = int(args.minutes * 60 / args.interval)
        loop = asyncio.get_running_loop()
        deadline = loop.time()
        with open(args.truth_file, "w") as truth_file:
            sim = Simulator(client, base, args, truth_file)
            for tick in range(1, total_ticks + 1):
                async def staggered(i: int, d: dict) -> None:
                    await asyncio.sleep(i / len(devices) * args.interval * 0.9)
                    await sim.send_device(d, tick, datetime.now(timezone.utc))

                await asyncio.gather(*(staggered(i, d) for i, d in enumerate(devices)))
                print(f"tick {tick}/{total_ticks}  {dict(sim.stats)}")
                deadline += args.interval
                if loop.time() > deadline:
                    print("  (behind schedule)")
                await asyncio.sleep(max(0.0, deadline - loop.time()))
            report(sim)
    print(f"Done. Ground truth written to {args.truth_file}")


if __name__ == "__main__":
    asyncio.run(main())