# Ingestion benchmarks

Test machine: 4 CPU cores, 7.6 GiB RAM. Simulator, API (1 uvicorn process), worker, Postgres/TimescaleDB and Redis all ran on the same laptop.
Load: simulated devices, one reading (3 metrics) every 10 s, staggered across the interval.

| Devices | Rate | Design | Client p50 / p95 / p99 | Enqueue to stored p50 / p95 / p99 | Result |
|---|---|---|---|---|---|
| 200 | 20/s | direct write | 29 / 50 / 87 ms | n/a | clean |
| 500 | 50/s | direct write | 27 / 135 / 236 ms | n/a | 1 network error |
| 1000 | 100/s | direct write | 6993 / 17067 / 19540 ms | n/a | every tick behind schedule |
| 500 | 50/s | Redis Streams + batch worker | 8 / 50 / 449 ms | 29 / 122 / 218 ms | 3000 queued, 3000 stored |
| 1000 | 100/s | Redis Streams + batch worker | 5 / 32 / 93 ms | 32 / 109 / 299 ms | 12000 queued, 12000 stored, queue depth 0 |

Notes:
- "Client latency" is the time the device waits for its HTTP response. With the queue this is the enqueue time only.
- Enqueue-to-stored percentiles cover the last 5000 messages the worker stored.
- Durability point: a message is acknowledged to the device once it is in Redis (append-only file, fsync every second). The worker acknowledges it only after the database commit, and unacknowledged messages are re-delivered. A Redis crash can lose up to one second of queued messages.
